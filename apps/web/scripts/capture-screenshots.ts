// pnpm --filter web screenshots
//
// seeds an empty market through the real api, builds and starts the
// production web app, captures the README screenshots into
// apps/docs/screenshots, then stops the server.
//
// needs the api running (pnpm dev, or the api alone) and Kafka up. nothing is
// canceled or cleaned up: if no market has an empty book, the script stops.
//
// env:
//   NEXT_PUBLIC_API_URL, NEXT_PUBLIC_WS_URL  inlined into the build
//                                            (default http://localhost:4000, ws://localhost:4000)
//   SEED_API_URL      where this script sends seed requests (default NEXT_PUBLIC_API_URL)
//   WEB_HOST          host for `next start` (default: next's own default)
//   CHROMIUM_ARGS     extra chromium flags as a JSON array of strings
//   SCREENSHOT_MARKET force one market; it must still have an empty book
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Decimal } from "decimal.js";
import { chromium, type Browser, type Page } from "playwright";
import { MARKETS, type Market } from "@repo/shared";
import { MARKET_CONFIG, type Asset } from "../lib/config/markets.ts";
import { ACCOUNTS_STORAGE_KEY, MARKET_STORAGE_KEY, type StoredAccounts } from "../lib/storage-keys.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(HERE, "..");
const OUT_DIR = path.resolve(WEB_DIR, "../docs/screenshots");

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:4000";
const SEED_API_URL = (process.env.SEED_API_URL ?? API_URL).replace(/\/$/, "");
const WEB_HOST = process.env.WEB_HOST;
const CHROMIUM_ARGS = JSON.parse(process.env.CHROMIUM_ARGS ?? "[]") as string[];
// the api's cors only allows this origin
const WEB_ORIGIN = "http://localhost:3000";
const VIEWPORT = { width: 1440, height: 900 };
const MAX_PNG_BYTES = 600 * 1024;

const LEVELS_PER_SIDE = 12;
const CROSSING_ORDERS = 17;
const QTY_MIN = new Decimal("0.12");
const QTY_MAX = new Decimal("14.8");

// a plausible mid price and the gap range between levels per market
const PRICE_PLAN: Record<Market, { mid: string; gapMin: string; gapMax: string }> = {
  SOLUSDC: { mid: "186.43", gapMin: "0.04", gapMax: "0.31" },
  ETHUSDC: { mid: "3418.27", gapMin: "0.37", gapMax: "2.86" },
  BTCUSDC: { mid: "96412.58", gapMin: "4.13", gapMax: "38.71" },
};

// non-round starting balances. "maker" rests the book, "trader" is the
// active account in the ui. raised automatically if the plan needs more.
const BALANCES: Record<Market, { maker: Partial<Record<Asset, string>>; trader: Partial<Record<Asset, string>> }> = {
  SOLUSDC: { maker: { USDC: "24816.53", SOL: "173.418" }, trader: { USDC: "6142.87", SOL: "41.296" } },
  ETHUSDC: { maker: { USDC: "248615.35", ETH: "73.4120" }, trader: { USDC: "61873.42", ETH: "27.5183" } },
  BTCUSDC: { maker: { USDC: "7418265.35", BTC: "81.73642" }, trader: { USDC: "1284716.42", BTC: "9.41237" } },
};

type Side = "BUY" | "SELL";
type Level = { price: Decimal; qty: Decimal };

// deterministic so reruns produce the same book shape
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261124);

function between(min: Decimal, max: Decimal, decimals: number, skew = 1): Decimal {
  const u = new Decimal(rand()).pow(skew);
  return min.plus(max.minus(min).times(u)).toDecimalPlaces(decimals, Decimal.ROUND_DOWN);
}

// no repeats and nothing that looks round (last decimal digit is never 0)
function uniqueQty(make: () => Decimal, used: Set<string>, decimals: number): Decimal {
  for (;;) {
    const q = make();
    const s = q.toFixed(decimals);
    if (q.lte(0) || s.endsWith("0") || used.has(s)) continue;
    used.add(s);
    return q;
  }
}

async function api<T>(method: string, route: string, body?: unknown, accountId?: string): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (accountId) headers["X-Account-Id"] = accountId;
  const res = await fetch(`${SEED_API_URL}${route}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${route} -> ${res.status} ${text}`);
  return JSON.parse(text) as T;
}

type Depth = { bids: [string, string][]; asks: [string, string][] };

async function pickEmptyMarket(): Promise<Market> {
  const forced = process.env.SCREENSHOT_MARKET as Market | undefined;
  const empty: Market[] = [];
  for (const symbol of MARKETS) {
    const depth = await api<Depth>("GET", `/api/v3/depth?symbol=${symbol}`);
    const rows = depth.bids.length + depth.asks.length;
    console.log(`depth ${symbol}: ${rows} resting order(s)`);
    if (rows === 0) empty.push(symbol);
  }
  if (forced) {
    if (!empty.includes(forced)) throw new Error(`SCREENSHOT_MARKET=${forced} does not have an empty book`);
    return forced;
  }
  const chosen = empty[0];
  if (!chosen) {
    throw new Error("every market has resting orders. the script needs an empty book and does not cancel orders.");
  }
  return chosen;
}

function order(symbol: Market, side: Side, price: Decimal, qty: Decimal, priceDp: number, qtyDp: number) {
  return { symbol, side, price: price.toFixed(priceDp), quantity: qty.toFixed(qtyDp) };
}

function raiseIfNeeded(balances: Partial<Record<Asset, string>>, asset: Asset, need: Decimal, dp: number) {
  const have = new Decimal(balances[asset] ?? "0");
  if (have.gte(need)) return;
  // keep it non-round: 23% headroom plus an odd tail
  const tail = new Decimal(37).div(new Decimal(10).pow(dp));
  balances[asset] = need.times("1.23").toDecimalPlaces(dp, Decimal.ROUND_UP).plus(tail).toFixed(dp);
  console.log(`raised ${asset} to ${balances[asset]} to cover the plan`);
}

function startServer(): ChildProcess {
  const args = ["start", "-p", "3000", ...(WEB_HOST ? ["-H", WEB_HOST] : [])];
  return spawn("next", args, { cwd: WEB_DIR, stdio: ["ignore", "inherit", "inherit"], detached: true });
}

function run(cmd: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: WEB_DIR, stdio: "inherit", env });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(" ")} exited ${code}`))));
  });
}

async function waitForServer(): Promise<void> {
  const host = WEB_HOST ? (WEB_HOST.includes(":") ? `[${WEB_HOST}]` : WEB_HOST) : "localhost";
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://${host}:3000/trade`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("next start did not answer on :3000");
}

async function waitReady(page: Page) {
  await page.waitForSelector('[data-testid="connection-status"][data-status="live"]', { timeout: 20000 });
  await page.waitForFunction(() => Number(document.querySelector('[data-testid="order-book"]')?.getAttribute("data-levels")) > 0);
}

type Box = { x: number; y: number; width: number; height: number };
// boundingBox is viewport-relative, so scroll to the top first to make it
// match the full-page coordinates used by clip
async function unionBox(page: Page, selectors: string[], pad = 0): Promise<Box> {
  await page.evaluate(() => window.scrollTo(0, 0));
  const boxes = await Promise.all(selectors.map((s) => page.locator(s).boundingBox()));
  if (boxes.some((b) => !b)) throw new Error(`missing element for ${selectors.join(", ")}`);
  const bs = boxes as Box[];
  const x = Math.max(0, Math.min(...bs.map((b) => b.x)) - pad);
  const y = Math.max(0, Math.min(...bs.map((b) => b.y)) - pad);
  const right = Math.max(...bs.map((b) => b.x + b.width)) + pad;
  const bottom = Math.max(...bs.map((b) => b.y + b.height)) + pad;
  return { x, y, width: right - x, height: bottom - y };
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const symbol = await pickEmptyMarket();
  const cfg = MARKET_CONFIG[symbol];
  const { priceDecimals: pdp, qtyDecimals: qdp } = cfg;
  console.log(`seeding ${symbol}`);

  // ---- plan the book: 12 levels per side around the mid ----
  const plan = PRICE_PLAN[symbol];
  const mid = new Decimal(plan.mid);
  const usedQty = new Set<string>();
  const gap = () => between(new Decimal(plan.gapMin), new Decimal(plan.gapMax), pdp);
  const levelQty = () => uniqueQty(() => between(QTY_MIN, QTY_MAX, qdp, 2.2), usedQty, qdp);

  const asks: Level[] = [];
  const bids: Level[] = [];
  let askPrice = mid.plus(gap().div(2).toDecimalPlaces(pdp, Decimal.ROUND_UP));
  let bidPrice = mid.minus(gap().div(2).toDecimalPlaces(pdp, Decimal.ROUND_UP));
  for (let i = 0; i < LEVELS_PER_SIDE; i++) {
    asks.push({ price: askPrice, qty: levelQty() });
    bids.push({ price: bidPrice, qty: levelQty() });
    askPrice = askPrice.plus(gap());
    bidPrice = bidPrice.minus(gap());
  }

  // ---- plan crossing orders: taker side alternates, each takes part of the
  // best opposite level so all 12 levels stay on the book ----
  const remainingAsk = asks.map((l) => l.qty);
  const remainingBid = bids.map((l) => l.qty);
  const crosses: { side: Side; price: Decimal; qty: Decimal }[] = [];
  for (let i = 0; i < CROSSING_ORDERS; i++) {
    const side: Side = i % 2 === 0 ? "BUY" : "SELL";
    const book = side === "BUY" ? asks : bids;
    const remaining = side === "BUY" ? remainingAsk : remainingBid;
    const best = book[0]!;
    const qty = uniqueQty(
      () => remaining[0]!.times(0.12 + rand() * 0.22).toDecimalPlaces(qdp, Decimal.ROUND_DOWN),
      usedQty,
      qdp,
    );
    remaining[0] = remaining[0]!.minus(qty);
    crosses.push({ side, price: best.price, qty });
  }

  // three resting orders for the trader, at existing level prices so the
  // book keeps 12 levels per side, none of them crossing
  const traderResting = [
    { side: "BUY" as Side, price: bids[2]!.price, qty: levelQty() },
    { side: "SELL" as Side, price: asks[4]!.price, qty: levelQty() },
    { side: "BUY" as Side, price: bids[7]!.price, qty: levelQty() },
  ];

  // ---- balances: presets, raised if the plan needs more ----
  const balances = structuredClone(BALANCES[symbol]);
  const sumQuote = (rows: { price: Decimal; qty: Decimal }[]) =>
    rows.reduce((acc, r) => acc.plus(r.price.times(r.qty)), new Decimal(0));
  const sumBase = (rows: { qty: Decimal }[]) => rows.reduce((acc, r) => acc.plus(r.qty), new Decimal(0));
  raiseIfNeeded(balances.maker, "USDC", sumQuote(bids), 2);
  raiseIfNeeded(balances.maker, cfg.base, sumBase(asks), qdp);
  const traderBuys = [...crosses, ...traderResting].filter((c) => c.side === "BUY");
  const traderSells = [...crosses, ...traderResting].filter((c) => c.side === "SELL");
  raiseIfNeeded(balances.trader, "USDC", sumQuote(traderBuys), 2);
  raiseIfNeeded(balances.trader, cfg.base, sumBase(traderSells), qdp);

  // ---- production build with the api urls inlined, then start ----
  await run("next", ["build"], { ...process.env, NEXT_PUBLIC_API_URL: API_URL, NEXT_PUBLIC_WS_URL: WS_URL });
  const server = startServer();
  let browser: Browser | null = null;
  try {
    await waitForServer();
    browser = await chromium.launch({ args: CHROMIUM_ARGS });

    // seeding starts only once build, server and browser are up, so a
    // failure before this point leaves the empty market untouched
    const recheck = await api<Depth>("GET", `/api/v3/depth?symbol=${symbol}`);
    if (recheck.bids.length + recheck.asks.length > 0) throw new Error(`${symbol} is no longer empty`);

    // ---- accounts and the resting book ----
    const maker = await api<{ accountId: string }>("POST", "/api/v1/accounts", { balances: balances.maker });
    const trader = await api<{ accountId: string }>("POST", "/api/v1/accounts", { balances: balances.trader });
    console.log(`maker ${maker.accountId}, trader ${trader.accountId}`);
    for (let i = 0; i < LEVELS_PER_SIDE; i++) {
      await api("POST", "/api/v3/order", order(symbol, "SELL", asks[i]!.price, asks[i]!.qty, pdp, qdp), maker.accountId);
      await api("POST", "/api/v3/order", order(symbol, "BUY", bids[i]!.price, bids[i]!.qty, pdp, qdp), maker.accountId);
    }

    const stored: StoredAccounts = {
      accounts: [
        { label: "Market maker", id: maker.accountId },
        { label: "Trader", id: trader.accountId },
      ],
      activeId: trader.accountId,
    };
    // two identical pages, 2x and 1x, both live while trades happen (the trade
    // feed only holds what arrived since load). 1x is the fallback for any
    // shot over 600KB.
    const pages: Record<"2x" | "1x", Page> = {} as Record<"2x" | "1x", Page>;
    for (const [key, scale] of [["2x", 2], ["1x", 1]] as const) {
      const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: scale });
      await context.addInitScript(
        ([accountsKey, marketKey, accounts, market]) => {
          window.localStorage.setItem(accountsKey, accounts);
          window.localStorage.setItem(marketKey, market);
        },
        [ACCOUNTS_STORAGE_KEY, MARKET_STORAGE_KEY, JSON.stringify(stored), symbol] as const,
      );
      const page = await context.newPage();
      page.on("pageerror", (e) => console.error(`[page ${key}] ${e.message}`));
      await page.goto(`${WEB_ORIGIN}/trade`);
      await waitReady(page);
      pages[key] = page;
    }

    // ---- crossing orders from the trader, then its three resting orders ----
    for (const c of crosses) {
      await api("POST", "/api/v3/order", order(symbol, c.side, c.price, c.qty, pdp, qdp), trader.accountId);
      await new Promise((r) => setTimeout(r, 180 + Math.floor(rand() * 420)));
    }
    for (const r of traderResting) {
      await api("POST", "/api/v3/order", order(symbol, r.side, r.price, r.qty, pdp, qdp), trader.accountId);
    }

    for (const page of Object.values(pages)) {
      await page.waitForFunction(
        (n) => Number(document.querySelector('[data-testid="trades-feed"]')?.getAttribute("data-count")) >= n,
        CROSSING_ORDERS,
        { timeout: 20000 },
      );
      // open orders are polled every 3s
      await page.waitForFunction(
        () => document.querySelector('[data-testid="open-orders"]')?.getAttribute("data-count") === "3",
        null,
        { timeout: 15000 },
      );
      // trades are logged in the feed only; let polling refresh balances too
      await page.waitForTimeout(3500);
      await page.mouse.move(0, VIEWPORT.height - 1);
    }

    async function shoot(name: string, capture: (page: Page) => Promise<Buffer>) {
      const file = path.join(OUT_DIR, name);
      for (const key of ["2x", "1x"] as const) {
        const page = pages[key];
        await waitReady(page);
        const png = await capture(page);
        if (png.length <= MAX_PNG_BYTES || key === "1x") {
          await writeFile(file, png);
          console.log(`${name}: ${key}, ${(png.length / 1024).toFixed(0)}KB`);
          return;
        }
        console.log(`${name}: ${(png.length / 1024).toFixed(0)}KB at 2x, retrying at 1x`);
      }
    }

    await shoot("trade.png", (p) => p.screenshot({ fullPage: true }));
    await shoot("order-book.png", async (p) =>
      p.screenshot({ fullPage: true, clip: await unionBox(p, ['[data-testid="order-book"]', '[data-testid="trades-feed"]'], 8) }),
    );
    await shoot("open-orders.png", async (p) =>
      p.screenshot({ fullPage: true, clip: await unionBox(p, ['[data-testid="open-orders"]', '[data-testid="balances"]'], 8) }),
    );

    // insufficient funds: buy far more than the trader's USDC covers
    const bestAsk = asks[0]!.price;
    const traderUsdc = new Decimal(balances.trader.USDC ?? "0");
    const tooMuch = traderUsdc.div(bestAsk).times("1.61").toDecimalPlaces(qdp, Decimal.ROUND_DOWN).plus(
      new Decimal(3).div(new Decimal(10).pow(qdp)),
    );
    for (const page of Object.values(pages)) {
      await page.click('[data-testid="side-BUY"]');
      await page.fill('input[name="price"]', bestAsk.toFixed(pdp));
      await page.fill('input[name="quantity"]', tooMuch.toFixed(qdp));
      await page.click('[data-testid="submit-order"]');
      await page.waitForSelector('[data-testid="order-form"] [role="alert"]');
      await page.mouse.move(0, VIEWPORT.height - 1);
    }
    await shoot("order-form-error.png", async (p) =>
      p.screenshot({ fullPage: true, clip: await unionBox(p, ['[data-testid="order-form"]'], 8) }),
    );

    for (const page of Object.values(pages)) {
      await page.click('[data-testid="account-switcher-toggle"]');
      await page.waitForSelector('[data-testid="account-panel"]');
      await page.mouse.move(0, VIEWPORT.height - 1);
    }
    await shoot("accounts.png", async (p) =>
      p.screenshot({
        fullPage: true,
        clip: await unionBox(p, ['[data-testid="account-switcher-toggle"]', '[data-testid="account-panel"]'], 0),
      }),
    );

    for (const name of ["trade.png", "order-book.png", "open-orders.png", "order-form-error.png", "accounts.png"]) {
      const { size } = await stat(path.join(OUT_DIR, name));
      if (size > MAX_PNG_BYTES) console.warn(`warning: ${name} is ${(size / 1024).toFixed(0)}KB even at 1x`);
    }
    console.log(`screenshots written to ${OUT_DIR}`);
  } finally {
    await browser?.close();
    // stop next start and anything it spawned
    if (server.pid) {
      try {
        process.kill(-server.pid, "SIGTERM");
      } catch {
        // already gone
      }
    }
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
