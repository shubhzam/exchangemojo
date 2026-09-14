import { Decimal } from "decimal.js";
import { MARKETS, type Market } from "@repo/shared";
import { prisma } from "../lib/db.js";
import { OrderBook } from "./order-book.js";

const books = new Map<Market, OrderBook>(
  MARKETS.map((market) => [market, new OrderBook(market)])
);

export function getOrderBook(market: Market): OrderBook {
  const book = books.get(market);
  if (!book) {
    // unreachable - MARKETS is exhaustive and zod already validated the
    // input - but fail loudly rather than silently returning undefined
    throw new Error(`no order book initialized for market: ${market}`);
  }
  return book;
}

// rebuilds every market's in-memory book from persisted resting orders.
// must complete before the server accepts traffic, or resting liquidity
// from before a restart is invisible until something else rests on top of it.
export async function rebuildAllBooksFromDb(): Promise<void> {
  for (const market of MARKETS) {
    const restingOrders = await prisma.order.findMany({
      where: { market, status: { in: ["NEW", "PARTIALLY_FILLED"] } },
      orderBy: { createdAt: "asc" },
    });

    const book = getOrderBook(market);
    for (const order of restingOrders) {
      // string round-trip, not a direct reuse of prisma's decimal instance -
      // guarantees we're always working with our own decimal.js type,
      // regardless of exactly what prisma's generated client returns
      book.addOrder({
        id: order.id,
        side: order.side,
        price: new Decimal(order.price.toString()),
        remainingQuantity: new Decimal(order.remainingQuantity.toString()),
        createdAt: order.createdAt,
      });
    }
  }
}