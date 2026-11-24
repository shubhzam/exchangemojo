"use client";

import { MARKETS } from "@repo/shared";
import { MARKET_CONFIG } from "@/lib/config/markets";
import { marketSelected } from "@/lib/store/prefs-slice";
import { useAppDispatch, useAppSelector } from "@/lib/store/store";
import { cx } from "./ui";

export function MarketSelector() {
  const dispatch = useAppDispatch();
  const selected = useAppSelector((s) => s.prefs.market);

  return (
    <nav role="tablist" aria-label="Market" className="flex items-center gap-1">
      {MARKETS.map((symbol) => {
        const active = symbol === selected;
        return (
          <button
            key={symbol}
            type="button"
            role="tab"
            aria-selected={active}
            data-testid={`market-${symbol}`}
            onClick={() => dispatch(marketSelected(symbol))}
            className={cx(
              "rounded px-3 py-1.5 text-sm font-medium",
              active ? "bg-accent-soft text-accent" : "text-muted hover:bg-raised hover:text-text",
            )}
          >
            {MARKET_CONFIG[symbol].label}
          </button>
        );
      })}
    </nav>
  );
}
