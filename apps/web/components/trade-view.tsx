"use client";

import Link from "next/link";
import type { Market } from "@repo/shared";
import { useMarketStream } from "@/hooks/use-market-stream";
import { useAppSelector } from "@/lib/store/store";
import { AccountSwitcher } from "./account-switcher";
import { Balances } from "./balances";
import { ConnectionIndicator } from "./connection-indicator";
import { MarketSelector } from "./market-selector";
import { OpenOrders } from "./open-orders";
import { OrderBook } from "./order-book";
import { OrderForm } from "./order-form";
import { TradesFeed } from "./trades-feed";

export function Brand() {
  return (
    <Link href="/trade" className="text-sm font-semibold tracking-tight text-text hover:text-text">
      crypto<span className="text-accent">-</span>exchange
    </Link>
  );
}

function Workspace({ market }: { market: Market }) {
  useMarketStream(market);
  return (
    <main className="grid grid-cols-[minmax(320px,1fr)_minmax(280px,0.85fr)_minmax(340px,1fr)] gap-3 p-3">
      <OrderBook market={market} />
      <TradesFeed market={market} />
      {/* keyed so price and amount reset on market switch */}
      <OrderForm key={market} market={market} />
      <OpenOrders className="col-span-2" />
      <Balances />
    </main>
  );
}

export function TradeView() {
  const hydrated = useAppSelector((s) => s.prefs.hydrated);
  const market = useAppSelector((s) => s.prefs.market);

  return (
    <div className="min-h-screen">
      <header className="flex h-14 items-center gap-6 border-b border-border bg-panel px-4">
        <Brand />
        <MarketSelector />
        <div className="ml-auto flex items-center gap-4">
          <ConnectionIndicator />
          <Link href="/health" className="text-sm">
            Health
          </Link>
          <AccountSwitcher />
        </div>
      </header>
      {/* wait for localStorage so the stream opens once, on the saved market */}
      {hydrated ? <Workspace market={market} /> : null}
    </div>
  );
}
