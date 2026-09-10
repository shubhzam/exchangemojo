import { prisma } from "../lib/db.js";
import type { Order as PrismaOrder } from "../generated/prisma/client.js";
import type { CreateOrderInput, Market } from "@repo/shared";

export type OrderResponse = {
  orderId: string;
  symbol: Market;
  side: "BUY" | "SELL";
  price: string;
  quantity: string;
  status: "NEW";
  transactTime: number;
};

// single place a raw db row becomes the shape the api returns.
// wire value and prisma enum value are the same string now, so this
// is pure field renaming - no translation, unlike the hyphenated design.
function toResponse(order: PrismaOrder): OrderResponse {
  return {
    orderId: order.id,
    symbol: order.market as Market,
    side: order.side,
    price: order.price.toFixed(8),
    quantity: order.quantity.toFixed(8),
    status: order.status,
    transactTime: order.createdAt.getTime(),
  };
}

export async function createOrder(input: CreateOrderInput): Promise<OrderResponse> {
  const order = await prisma.order.create({
    data: {
      market: input.symbol,
      side: input.side,
      price: input.price,
      quantity: input.quantity,
    },
  });
  return toResponse(order);
}

type OrderBook = {
  symbol: Market;
  bids: [string, string][];
  asks: [string, string][];
};

export async function getOrderBook(symbol: Market): Promise<OrderBook> {
  const [bids, asks] = await Promise.all([
    prisma.order.findMany({
      where: { market: symbol, status: "NEW", side: "BUY" },
      orderBy: { price: "desc" },
    }),
    prisma.order.findMany({
      where: { market: symbol, status: "NEW", side: "SELL" },
      orderBy: { price: "asc" },
    }),
  ]);

  return {
    symbol,
    bids: bids.map((o) => [o.price.toString(), o.quantity.toString()]),
    asks: asks.map((o) => [o.price.toString(), o.quantity.toString()]),
  };
}