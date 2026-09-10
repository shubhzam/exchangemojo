import { z } from "zod";

// binance-style symbols, no separator. wire value and prisma enum
// value are character-identical - see order-service.ts, no mapping needed.
export const MARKETS = ["SOLUSDC", "ETHUSDC", "BTCUSDC"] as const;

export const marketSchema = z.enum(MARKETS);

export type Market = z.infer<typeof marketSchema>;