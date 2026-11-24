"use client";

import { useState } from "react";
import { createOrderSchema, type Market, type OrderSide } from "@repo/shared";
import { useActiveAccount } from "@/hooks/use-active-account";
import { ACCOUNT_POLL_MS, usePollingInterval } from "@/hooks/use-polling-interval";
import { describeApiError } from "@/lib/api/client";
import { useGetAccountQuery, usePlaceOrderMutation } from "@/lib/api/exchange-api";
import type { OrderResponse } from "@/lib/api/types";
import { ASSET_DECIMALS, MARKET_CONFIG, MAX_INTEGER_DIGITS } from "@/lib/config/markets";
import { formatAmount, toDecimal } from "@/lib/decimal";
import { InlineError, Panel, PanelHeader, cx, inputClass, primaryButton } from "./ui";

type FieldErrors = { price?: string; quantity?: string };

// accepts a partial decimal while typing, limited to the market's precision
function fitsPrecision(value: string, decimals: number): boolean {
  return new RegExp(`^\\d{0,${MAX_INTEGER_DIGITS}}(\\.\\d{0,${decimals}})?$`).test(value);
}

const STATUS_LABEL: Record<OrderResponse["status"], string> = {
  NEW: "resting",
  PARTIALLY_FILLED: "partially filled",
  FILLED: "filled",
  CANCELED: "canceled",
};

export function OrderForm({ market }: { market: Market }) {
  const config = MARKET_CONFIG[market];
  const account = useActiveAccount();
  const pollingInterval = usePollingInterval(ACCOUNT_POLL_MS);
  const { data: accountData } = useGetAccountQuery(account?.id ?? "", { skip: !account, pollingInterval });
  const [placeOrder, { isLoading }] = usePlaceOrderMutation();

  const [side, setSide] = useState<OrderSide>("BUY");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [result, setResult] = useState<OrderResponse | null>(null);

  const priceD = toDecimal(price);
  const qtyD = toDecimal(quantity);
  const total = priceD && qtyD ? priceD.times(qtyD) : null;

  const spendAsset = side === "BUY" ? config.quote : config.base;
  const available = accountData?.balances.find((b) => b.asset === spendAsset)?.free ?? null;

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setApiError(null);
    setResult(null);
    if (!account) return;

    const parsed = createOrderSchema.safeParse({ symbol: market, side, price, quantity });
    if (!parsed.success) {
      const errors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if ((field === "price" || field === "quantity") && !errors[field]) errors[field] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    try {
      const order = await placeOrder({ accountId: account.id, order: parsed.data }).unwrap();
      setResult(order);
      setQuantity("");
    } catch (err) {
      setApiError(describeApiError(err));
    }
  };

  return (
    <Panel data-testid="order-form" className="self-start">
      <PanelHeader title="Place order">
        <span className="text-xs text-muted">Limit</span>
      </PanelHeader>

      <div role="tablist" aria-label="Side" className="grid grid-cols-2 border-b border-border">
        {(["BUY", "SELL"] as const).map((s) => {
          const active = s === side;
          return (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`side-${s}`}
              onClick={() => {
                setSide(s);
                setApiError(null);
                setResult(null);
              }}
              className={cx(
                "border-b-2 py-2 text-sm font-semibold",
                s === "BUY" ? "text-buy" : "text-sell",
                active ? "border-accent bg-accent-soft" : "border-transparent hover:bg-raised",
              )}
            >
              {s === "BUY" ? "Buy" : "Sell"}
            </button>
          );
        })}
      </div>

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3 p-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted">Available</span>
          <span className="text-text num">
            {available !== null ? `${formatAmount(available, ASSET_DECIMALS[spendAsset])} ${spendAsset}` : "-"}
          </span>
        </div>

        <label className="flex flex-col gap-1 text-xs text-muted">
          Price ({config.quote})
          <input
            name="price"
            inputMode="decimal"
            autoComplete="off"
            placeholder={`0.${"0".repeat(config.priceDecimals)}`}
            value={price}
            aria-invalid={Boolean(fieldErrors.price)}
            onChange={(e) => fitsPrecision(e.target.value, config.priceDecimals) && setPrice(e.target.value)}
            className={cx(inputClass, "num")}
          />
          {fieldErrors.price && <span className="text-accent">{fieldErrors.price}</span>}
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted">
          Amount ({config.base})
          <input
            name="quantity"
            inputMode="decimal"
            autoComplete="off"
            placeholder={`0.${"0".repeat(config.qtyDecimals)}`}
            value={quantity}
            aria-invalid={Boolean(fieldErrors.quantity)}
            onChange={(e) => fitsPrecision(e.target.value, config.qtyDecimals) && setQuantity(e.target.value)}
            className={cx(inputClass, "num")}
          />
          {fieldErrors.quantity && <span className="text-accent">{fieldErrors.quantity}</span>}
        </label>

        <div className="flex items-center justify-between rounded bg-raised px-3 py-2 text-xs">
          <span className="text-muted">Total ({config.quote})</span>
          <span className="text-text num" data-testid="order-total">
            {total ? formatAmount(total, ASSET_DECIMALS.USDC) : "-"}
          </span>
        </div>

        <button type="submit" disabled={!account || isLoading} className={primaryButton} data-testid="submit-order">
          {isLoading ? "Placing..." : `${side === "BUY" ? "Buy" : "Sell"} ${config.base}`}
        </button>

        {!account && <p className="text-xs text-muted">Create or select an account to trade.</p>}
        {apiError && <InlineError>{apiError}</InlineError>}
        {result && (
          <p className="text-xs text-muted" role="status">
            <span className={result.side === "BUY" ? "text-buy" : "text-sell"}>
              {result.side === "BUY" ? "Buy" : "Sell"}
            </span>{" "}
            order {STATUS_LABEL[result.status]}:{" "}
            <span className="text-text num">
              {formatAmount(result.executedQty, config.qtyDecimals)} of {formatAmount(result.origQty, config.qtyDecimals)}{" "}
              {config.base}
            </span>{" "}
            filled{result.fills.length > 0 ? ` across ${result.fills.length} trade${result.fills.length === 1 ? "" : "s"}` : ""}.
          </p>
        )}
      </form>
    </Panel>
  );
}
