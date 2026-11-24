"use client";

import { useState } from "react";
import { useActiveAccount } from "@/hooks/use-active-account";
import { ACCOUNT_POLL_MS, usePollingInterval } from "@/hooks/use-polling-interval";
import { describeApiError } from "@/lib/api/client";
import { useCancelOrderMutation, useGetOpenOrdersQuery } from "@/lib/api/exchange-api";
import type { OpenOrder } from "@/lib/api/types";
import { MARKET_CONFIG } from "@/lib/config/markets";
import { formatAmount } from "@/lib/decimal";
import { InlineError, Panel, PanelHeader, cx, secondaryButton } from "./ui";

function formatTime(ms: number): string {
  return new Date(ms).toLocaleString("en-GB", { hour12: false, dateStyle: "short", timeStyle: "medium" });
}

export function OpenOrders({ className }: { className?: string }) {
  const account = useActiveAccount();
  const pollingInterval = usePollingInterval(ACCOUNT_POLL_MS);
  const { data, error, isLoading } = useGetOpenOrdersQuery(
    { accountId: account?.id ?? "" },
    { skip: !account, pollingInterval },
  );
  const [cancelOrder] = useCancelOrderMutation();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const onCancel = async (order: OpenOrder) => {
    if (!account) return;
    setPendingId(order.orderId);
    setCancelError(null);
    try {
      await cancelOrder({ accountId: account.id, symbol: order.symbol, orderId: order.orderId }).unwrap();
    } catch (err) {
      setCancelError(describeApiError(err));
    } finally {
      setPendingId(null);
    }
  };

  const orders = data ?? [];

  return (
    <Panel data-testid="open-orders" data-count={orders.length} className={className}>
      <PanelHeader title="Open orders">
        <span className="text-xs text-muted">{account ? `${orders.length} open, all markets` : ""}</span>
      </PanelHeader>
      {cancelError && (
        <div className="p-3 pb-0">
          <InlineError>{cancelError}</InlineError>
        </div>
      )}
      {!account ? (
        <p className="px-3 py-6 text-center text-xs text-muted">Create or select an account to see its orders.</p>
      ) : error ? (
        <div className="p-3">
          <InlineError>{describeApiError(error)}</InlineError>
        </div>
      ) : isLoading ? (
        <p className="px-3 py-6 text-center text-xs text-muted">Loading orders...</p>
      ) : orders.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-muted">No open orders.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-[11px] text-muted">
              <tr>
                <th className="px-3 py-1.5 font-normal">Time</th>
                <th className="px-3 py-1.5 font-normal">Market</th>
                <th className="px-3 py-1.5 font-normal">Side</th>
                <th className="px-3 py-1.5 text-right font-normal">Price</th>
                <th className="px-3 py-1.5 text-right font-normal">Amount</th>
                <th className="px-3 py-1.5 text-right font-normal">Filled</th>
                <th className="px-3 py-1.5 font-normal">Status</th>
                <th className="px-3 py-1.5 font-normal">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const cfg = MARKET_CONFIG[o.symbol];
                return (
                  <tr key={o.orderId} className="border-t border-border">
                    <td className="px-3 py-1.5 text-muted num">{formatTime(o.transactTime)}</td>
                    <td className="px-3 py-1.5 text-text">{cfg.label}</td>
                    <td className={cx("px-3 py-1.5 font-semibold", o.side === "BUY" ? "text-buy" : "text-sell")}>
                      {o.side === "BUY" ? "Buy" : "Sell"}
                    </td>
                    <td className="px-3 py-1.5 text-right text-text num">{formatAmount(o.price, cfg.priceDecimals)}</td>
                    <td className="px-3 py-1.5 text-right text-text num">{formatAmount(o.origQty, cfg.qtyDecimals)}</td>
                    <td className="px-3 py-1.5 text-right text-muted num">
                      {formatAmount(o.executedQty, cfg.qtyDecimals)}
                    </td>
                    <td className="px-3 py-1.5 text-muted">{o.status === "NEW" ? "Open" : "Partially filled"}</td>
                    <td className="px-3 py-1.5 text-right">
                      <button
                        type="button"
                        className={secondaryButton}
                        disabled={pendingId === o.orderId}
                        onClick={() => void onCancel(o)}
                        data-testid="cancel-order"
                      >
                        {pendingId === o.orderId ? "Canceling..." : "Cancel"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
