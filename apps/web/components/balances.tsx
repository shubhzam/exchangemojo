"use client";

import { useActiveAccount } from "@/hooks/use-active-account";
import { ACCOUNT_POLL_MS, usePollingInterval } from "@/hooks/use-polling-interval";
import { describeApiError } from "@/lib/api/client";
import { useGetAccountQuery } from "@/lib/api/exchange-api";
import { ASSETS, ASSET_DECIMALS } from "@/lib/config/markets";
import { Decimal, formatAmount } from "@/lib/decimal";
import { InlineError, Panel, PanelHeader } from "./ui";

export function Balances() {
  const account = useActiveAccount();
  const pollingInterval = usePollingInterval(ACCOUNT_POLL_MS);
  const { data, error, isLoading } = useGetAccountQuery(account?.id ?? "", { skip: !account, pollingInterval });

  return (
    <Panel data-testid="balances" className="self-start">
      <PanelHeader title="Balances">
        <span className="text-xs text-muted">{account?.label ?? ""}</span>
      </PanelHeader>
      {!account ? (
        <p className="px-3 py-6 text-center text-xs text-muted">Create or select an account to see balances.</p>
      ) : error ? (
        <div className="p-3">
          <InlineError>{describeApiError(error)}</InlineError>
        </div>
      ) : isLoading || !data ? (
        <p className="px-3 py-6 text-center text-xs text-muted">Loading balances...</p>
      ) : (
        <table className="w-full text-xs">
          <thead className="text-left text-[11px] text-muted">
            <tr>
              <th className="px-3 py-1.5 font-normal">Asset</th>
              <th className="px-3 py-1.5 text-right font-normal">Free</th>
              <th className="px-3 py-1.5 text-right font-normal">Locked</th>
              <th className="px-3 py-1.5 text-right font-normal">Total</th>
            </tr>
          </thead>
          <tbody>
            {ASSETS.map((asset) => {
              const b = data.balances.find((x) => x.asset === asset) ?? { free: "0", locked: "0" };
              const decimals = ASSET_DECIMALS[asset];
              return (
                <tr key={asset} className="border-t border-border">
                  <td className="px-3 py-1.5 font-semibold text-text">{asset}</td>
                  <td className="px-3 py-1.5 text-right text-text num">{formatAmount(b.free, decimals)}</td>
                  <td className="px-3 py-1.5 text-right text-muted num">{formatAmount(b.locked, decimals)}</td>
                  <td className="px-3 py-1.5 text-right text-text num">
                    {formatAmount(new Decimal(b.free).plus(b.locked), decimals)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
