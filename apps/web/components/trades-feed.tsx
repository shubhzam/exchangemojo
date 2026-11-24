"use client";

import type { Market } from "@repo/shared";
import { MARKET_CONFIG, TRADE_FEED_LIMIT } from "@/lib/config/markets";
import { formatAmount } from "@/lib/decimal";
import { useAppSelector } from "@/lib/store/store";
import { Panel, PanelHeader, cx } from "./ui";

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-GB", { hour12: false });
}

export function TradesFeed({ market }: { market: Market }) {
  const trades = useAppSelector((s) => s.trades.items);
  const { base, quote, priceDecimals, qtyDecimals } = MARKET_CONFIG[market];

  return (
    <Panel data-testid="trades-feed" data-count={trades.length} className="min-h-0">
      <PanelHeader title="Recent trades">
        <span className="text-xs text-muted">Last {TRADE_FEED_LIMIT} since load</span>
      </PanelHeader>
      <div className="grid grid-cols-3 px-3 py-1.5 text-[11px] text-muted">
        <span>Price ({quote})</span>
        <span className="text-right">Size ({base})</span>
        <span className="text-right">Time</span>
      </div>
      <div className="min-h-0 flex-1 basis-0 overflow-y-auto">
        {trades.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted">
            No trades yet. This feed starts empty and fills from the live stream.
          </p>
        ) : (
          trades.map((t) => (
            <div key={t.t} className="grid h-5 grid-cols-3 items-center px-3 text-xs num">
              {/* m: buyer was the maker, so the taker sold */}
              <span className={cx(t.m ? "text-sell" : "text-buy")}>{formatAmount(t.p, priceDecimals)}</span>
              <span className="text-right text-text">{formatAmount(t.q, qtyDecimals)}</span>
              <span className="text-right text-muted">{formatTime(t.T)}</span>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}
