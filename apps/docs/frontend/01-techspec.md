# Frontend - Techspec

## Scope

Trading UI in `apps/web` for the spot exchange (SOLUSDC, ETHUSDC, BTCUSDC). `/trade` is the main page, `/health` keeps the status page. No auth, no charts.

## Verified against the code (differs from the brief)

- **CORS exists.** `apps/api/src/index.ts` allows only `http://localhost:3000`. No API change.
- **`createAccount` seeds zero balances**, but `POST /api/v1/accounts` accepts optional `balances: {USDC?, SOL?, ETH?, BTC?}` strings. The create button uses that field with editable amounts.
- **`GET /api/v3/depth` returns one row per order**, not per level. The client sums per price and slices to 15.
- **Errors:** 400 `invalid_input` with `details`, 400 `insufficient_funds` with `asset`, `required`, `available`, 404 `order_not_found` or `account_not_found`. A missing header is 400, not 401.
- **Cancel** has no ownership check and returns no fills.
- **`@repo/shared`** exports from `dist/`, so build it before `web` dev. It has no response types; those live in `apps/web`.

## Stack

Next.js 16 App Router, Tailwind v4, Redux Toolkit + RTK Query, `decimal.js`, `@repo/shared`, Playwright for screenshots.

## Structure

```
app/page.tsx          redirect to /trade
app/health/page.tsx   status page, env-based URL
app/trade/page.tsx    trading layout
lib/config/markets.ts price/qty decimals per market (only place)
lib/api/              typed client, ApiError, response types, RTK Query
lib/store/            store, book, trades, accounts slices
hooks/                useMarketStream, useAccounts
components/           panels and controls
scripts/              capture-screenshots.ts
```

## State

- **REST:** one RTK Query API. `baseQuery` adds `X-Account-Id`. Account-scoped queries take `accountId` as an argument. Place and cancel invalidate `Account` and `OpenOrders`; both poll every 3s while `document.visibilityState` is visible (not focus, so two side-by-side windows both update).
- **Book:** `{symbol, bids, asks}`, each `Record<price, qty>`. Zero qty deletes. Asks ascending, bids descending, top 15.
- **Trades:** newest first, capped at 50, starts empty.
- **Accounts:** `{label, id}[]` and the active id in localStorage under `cx.accounts.v1`, read after mount.

## Market stream

`useMarketStream(symbol)` opens `@depth` and `@trade` sockets with exponential backoff capped at 10s. Every open fetches the snapshot and replaces the book; events arriving earlier are buffered and replayed. A 30s timer refetches. Cleanup closes both sockets and clears state; events whose `s` differs are dropped.

## Money

Strings end to end, `Decimal` for totals and cumulative sums, display rounded down to market precision. Inputs are limited to market decimals and 10 integer digits (`Decimal(18,8)` columns), checked alongside `createOrderSchema`.

## Theme

Dark only, `color-scheme: dark`, no toggle. Tokens in an `@theme` block in `app/globals.css`: bg, panel, raised, border, text, muted, accent, accent-hover, accent-soft, buy, sell. Components use token classes only, never hex. Orange is the only accent: primary buttons with black text, active tab, selected market, links, focus rings, input focus borders, reconnecting dot. Green and red appear only on side labels, price direction, size bars and trade rows. Numbers use monospace `tabular-nums`. Text contrast is at least 4.5:1, every control has an orange `focus-visible` ring, scrollbars are dark.

## Docs, diagrams and screenshots

- `apps/docs/diagrams/`: `architecture` and `order-status`, each a `.excalidraw` source plus a 2x PNG, hand-drawn with Excalifont on solid `#0a0a0a`, rendered by Excalidraw's `exportToSvg` in headless Chromium.
- `apps/docs/screenshots/`: `pnpm --filter web screenshots` seeds an empty market through the real API, injects accounts, runs a production build, captures five shots at 1440x900 and stops the server.
- Root `README.md` embeds both.

## Known backend gaps (not fixed)

No depth sequence ids, recent-trades endpoint, user stream or candles.
