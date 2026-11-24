// response shapes of apps/api. @repo/shared only carries request schemas, so
// these mirror order-service.ts, account-service.ts and streaming-service.ts.
import type { Market, OrderSide } from "@repo/shared";
import type { Asset } from "@/lib/config/markets";

export type OrderStatus = "NEW" | "PARTIALLY_FILLED" | "FILLED" | "CANCELED";

export type Balance = { asset: Asset; free: string; locked: string };

export type AccountResponse = { accountId: string; balances: Balance[] };

export type Fill = { price: string; qty: string; tradeId: string };

export type OrderResponse = {
  orderId: string;
  symbol: Market;
  side: OrderSide;
  price: string;
  origQty: string;
  executedQty: string;
  status: OrderStatus;
  fills: Fill[];
  transactTime: number;
};

export type OpenOrder = Omit<OrderResponse, "fills">;

export type CancelOrderResponse = {
  symbol: Market;
  orderId: string;
  price: string;
  origQty: string;
  executedQty: string;
  status: OrderStatus;
};

export type PriceLevel = [price: string, qty: string];

// one row per resting order, not per price level
export type DepthResponse = { symbol: Market; bids: PriceLevel[]; asks: PriceLevel[] };

export type DepthEvent = {
  e: "depthUpdate";
  E: number;
  s: Market;
  b: PriceLevel[];
  a: PriceLevel[];
};

export type TradeEvent = {
  e: "trade";
  E: number;
  s: Market;
  t: string;
  p: string;
  q: string;
  b: string;
  a: string;
  T: number;
  // true when the buyer was the maker, i.e. the taker sold
  m: boolean;
};

export type ApiIssue = { path?: (string | number)[]; message: string };

export type ApiErrorBody = {
  error: string;
  details?: ApiIssue[];
  asset?: string;
  required?: string;
  available?: string;
};

export function isDepthEvent(value: unknown): value is DepthEvent {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as DepthEvent).e === "depthUpdate" &&
    Array.isArray((value as DepthEvent).b) &&
    Array.isArray((value as DepthEvent).a)
  );
}

export function isTradeEvent(value: unknown): value is TradeEvent {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as TradeEvent).e === "trade" &&
    typeof (value as TradeEvent).p === "string" &&
    typeof (value as TradeEvent).q === "string"
  );
}
