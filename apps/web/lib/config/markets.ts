// the only place per-market precision lives. the backend stores 8 decimals
// (Decimal(18,8)) and enforces no tick or lot size, so these are UI limits:
// inputs are restricted to them and display rounds down to them.
import type { Market } from "@repo/shared";

export type Asset = "USDC" | "SOL" | "ETH" | "BTC";
export type BaseAsset = Exclude<Asset, "USDC">;

export type MarketConfig = {
  symbol: Market;
  label: string;
  base: BaseAsset;
  quote: "USDC";
  priceDecimals: number;
  qtyDecimals: number;
};

export const MARKET_CONFIG = {
  SOLUSDC: { symbol: "SOLUSDC", label: "SOL/USDC", base: "SOL", quote: "USDC", priceDecimals: 2, qtyDecimals: 3 },
  ETHUSDC: { symbol: "ETHUSDC", label: "ETH/USDC", base: "ETH", quote: "USDC", priceDecimals: 2, qtyDecimals: 4 },
  BTCUSDC: { symbol: "BTCUSDC", label: "BTC/USDC", base: "BTC", quote: "USDC", priceDecimals: 2, qtyDecimals: 5 },
} as const satisfies Record<Market, MarketConfig>;

export const ASSETS: readonly Asset[] = ["USDC", "SOL", "ETH", "BTC"];

// display decimals per asset: quote uses price decimals, each base asset
// uses its market's quantity decimals
export const ASSET_DECIMALS: Record<Asset, number> = {
  USDC: 2,
  SOL: MARKET_CONFIG.SOLUSDC.qtyDecimals,
  ETH: MARKET_CONFIG.ETHUSDC.qtyDecimals,
  BTC: MARKET_CONFIG.BTCUSDC.qtyDecimals,
};

// Decimal(18,8) leaves 10 integer digits
export const MAX_INTEGER_DIGITS = 10;

export const DEFAULT_MARKET: Market = "SOLUSDC";
export const BOOK_LEVELS_PER_SIDE = 15;
export const TRADE_FEED_LIMIT = 50;

// default starting balances offered when creating a test account
export const DEFAULT_STARTING_BALANCES: Record<Asset, string> = {
  USDC: "10000",
  SOL: "100",
  ETH: "5",
  BTC: "0.5",
};
