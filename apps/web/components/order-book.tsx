"use client";

import type { Market } from "@repo/shared";
import { BOOK_LEVELS_PER_SIDE, MARKET_CONFIG } from "@/lib/config/markets";
import { Decimal, formatAmount } from "@/lib/decimal";
import { selectBookView, type BookRow } from "@/lib/store/book-slice";
import { useAppSelector } from "@/lib/store/store";
import { Panel, PanelHeader, cx } from "./ui";

const ROW_HEIGHT = "h-5";
const SIDE_HEIGHT = "h-[300px]"; // 15 rows of h-5

function Row({ row, side, market }: { row: BookRow; side: "bid" | "ask"; market: Market }) {
  const { priceDecimals, qtyDecimals } = MARKET_CONFIG[market];
  return (
    <div className={cx("relative grid grid-cols-3 items-center px-3 text-xs num", ROW_HEIGHT)}>
      <span
        aria-hidden
        className={cx("absolute inset-y-0 right-0", side === "bid" ? "bg-buy/15" : "bg-sell/15")}
        style={{ width: `${row.depthPercent}%` }}
      />
      <span className={cx("relative", side === "bid" ? "text-buy" : "text-sell")}>
        {formatAmount(row.price, priceDecimals)}
      </span>
      <span className="relative text-right text-text">{formatAmount(row.qty, qtyDecimals)}</span>
      <span className="relative text-right text-muted">{formatAmount(row.cumulative, qtyDecimals)}</span>
    </div>
  );
}

function LastPrice({ market }: { market: Market }) {
  const [latest, previous] = useAppSelector((s) => s.trades.items);
  const { priceDecimals } = MARKET_CONFIG[market];
  if (!latest) return <span className="text-sm text-muted num">-</span>;

  // direction against the previous trade; with one trade, the taker side
  const up = previous ? new Decimal(latest.p).greaterThanOrEqualTo(previous.p) : !latest.m;
  return (
    <span className={cx("text-sm font-semibold num", up ? "text-buy" : "text-sell")}>
      {formatAmount(latest.p, priceDecimals)} {up ? "↑" : "↓"}
    </span>
  );
}

export function OrderBook({ market }: { market: Market }) {
  const view = useAppSelector(selectBookView);
  const ready = useAppSelector((s) => s.book.ready);
  const { base, quote, priceDecimals } = MARKET_CONFIG[market];
  const empty = view.asks.length === 0 && view.bids.length === 0;

  return (
    <Panel data-testid="order-book" data-ready={ready} data-levels={view.asks.length + view.bids.length}>
      <PanelHeader title="Order book">
        <span className="text-xs text-muted">Top {BOOK_LEVELS_PER_SIDE} per side</span>
      </PanelHeader>
      <div className="grid grid-cols-3 px-3 py-1.5 text-[11px] text-muted">
        <span>Price ({quote})</span>
        <span className="text-right">Size ({base})</span>
        <span className="text-right">Total ({base})</span>
      </div>

      <div className={cx("flex flex-col justify-end overflow-hidden", SIDE_HEIGHT)} data-testid="book-asks">
        {view.asks.map((row) => (
          <Row key={row.price} row={row} side="ask" market={market} />
        ))}
      </div>

      <div className="flex items-center justify-between border-y border-border bg-raised px-3 py-2">
        <LastPrice market={market} />
        <span className="text-xs text-muted">
          Spread <span className="text-text num">{view.spread ? formatAmount(view.spread, priceDecimals) : "-"}</span>
        </span>
      </div>

      <div className={cx("flex flex-col overflow-hidden", SIDE_HEIGHT)} data-testid="book-bids">
        {view.bids.map((row) => (
          <Row key={row.price} row={row} side="bid" market={market} />
        ))}
        {empty && (
          <p className="px-3 py-6 text-center text-xs text-muted">
            {ready ? "No resting orders in this market." : "Loading book..."}
          </p>
        )}
      </div>
    </Panel>
  );
}
