import { Decimal } from "decimal.js";
import { uuidv7 } from "uuidv7";
import { prisma } from "../lib/db.js";
import { getOrderBook } from "../matching-engine/registry.js";
import type { BookOrder } from "../matching-engine/order-book.js";
import type { CreateOrderInput, Market } from "@repo/shared";
import type { OrderStatus } from "../generated/prisma/client.js";

export type FillResponse = {
  price: string;
  qty: string;
  tradeId: string;
};

export type OrderResponse = {
  orderId: string;
  symbol: Market;
  side: "BUY" | "SELL";
  price: string;
  origQty: string;
  executedQty: string;
  status: OrderStatus;
  fills: FillResponse[];
  transactTime: number;
};

export async function createOrder(input: CreateOrderInput): Promise<OrderResponse> {
  const book = getOrderBook(input.symbol);
  const takerPrice = new Decimal(input.price);
  const takerQuantity = new Decimal(input.quantity);

  const takerId = uuidv7();

  // --- synchronous block starts: no await until persistence below ---
  const { fills, takerRemainingQuantity, touchedMakers } = book.match(
    { side: input.side, price: takerPrice },
    takerQuantity
  );

  if (takerRemainingQuantity.greaterThan(0)) {
    const takerBookOrder: BookOrder = {
      id: takerId,
      side: input.side,
      price: takerPrice,
      remainingQuantity: takerRemainingQuantity,
      createdAt: new Date(),
    };
    book.addOrder(takerBookOrder);
  }
  // --- synchronous block ends ---

  const takerStatus: OrderStatus = takerRemainingQuantity.isZero()
    ? "FILLED"
    : fills.length > 0
      ? "PARTIALLY_FILLED"
      : "NEW";

  const { order, trades } = await prisma.$transaction(async (tx) => {
    for (const maker of touchedMakers) {
      await tx.order.update({
        where: { id: maker.id },
        data: {
          remainingQuantity: maker.remainingQuantity.toString(),
          status: maker.remainingQuantity.isZero() ? "FILLED" : "PARTIALLY_FILLED",
        },
      });
    }

    const created = await tx.order.create({
      data: {
        id: takerId,
        market: input.symbol,
        side: input.side,
        price: input.price,
        quantity: input.quantity,
        remainingQuantity: takerRemainingQuantity.toString(),
        status: takerStatus,
      },
    });

    const createdTrades = [];
    for (const fill of fills) {
      const trade = await tx.trade.create({
        data: {
          market: input.symbol,
          price: fill.price.toString(),
          quantity: fill.quantity.toString(),
          makerOrderId: fill.makerOrderId,
          takerOrderId: takerId,
        },
      });
      createdTrades.push(trade);
    }

    return { order: created, trades: createdTrades };
  });

  return {
    orderId: order.id,
    symbol: input.symbol,
    side: input.side,
    price: takerPrice.toFixed(8),
    origQty: takerQuantity.toFixed(8),
    executedQty: takerQuantity.minus(takerRemainingQuantity).toFixed(8),
    status: takerStatus,
    fills: fills.map((fill, i) => {
      const trade = trades[i];
      if (!trade) {
        // unreachable - trades is built with exactly one entry per fill,
        // same order, in the transaction above - but the array-index type
        // can't prove that, same as the order-book.ts checks
        throw new Error("trade/fill count mismatch - this should never happen");
      }
      return {
        price: fill.price.toFixed(8),
        qty: fill.quantity.toFixed(8),
        tradeId: trade.id,
      };
    }),
    transactTime: order.createdAt.getTime(),
  };
}

export async function getDepth(symbol: Market) {
  const [bids, asks] = await Promise.all([
    prisma.order.findMany({
      where: { market: symbol, status: { in: ["NEW", "PARTIALLY_FILLED"] }, side: "BUY" },
      orderBy: { price: "desc" },
    }),
    prisma.order.findMany({
      where: { market: symbol, status: { in: ["NEW", "PARTIALLY_FILLED"] }, side: "SELL" },
      orderBy: { price: "asc" },
    }),
  ]);

  return {
    symbol,
    bids: bids.map((o) => [o.price.toFixed(8), o.remainingQuantity.toFixed(8)] as [string, string]),
    asks: asks.map((o) => [o.price.toFixed(8), o.remainingQuantity.toFixed(8)] as [string, string]),
  };
}