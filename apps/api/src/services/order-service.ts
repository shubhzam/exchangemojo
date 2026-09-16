import { Decimal } from "decimal.js";
import { uuidv7 } from "uuidv7";
import { prisma } from "../lib/db.js";
import { getOrderBook } from "../matching-engine/registry.js";
import type { BookOrder } from "../matching-engine/order-book.js";
import { reservationFor, reserveFunds, releaseFunds, settleFill } from "./balance-service.js";
import { publishTrade, publishDepth } from "./streaming-service.js";
import type { CreateOrderInput, Market, OrderSide } from "@repo/shared";
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

function computeDepthUpdates(
  book: ReturnType<typeof getOrderBook>,
  takerSide: OrderSide,
  touchedMakers: BookOrder[],
  takerRestingPrice: Decimal | null
): { bids: [string, string][]; asks: [string, string][] } {
  const makerSide: OrderSide = takerSide === "BUY" ? "SELL" : "BUY";
  const distinctMakerPrices = [...new Set(touchedMakers.map((m) => m.price.toString()))].map(
    (p) => new Decimal(p)
  );

  const bids: [string, string][] = [];
  const asks: [string, string][] = [];

  for (const price of distinctMakerPrices) {
    const qty = book.getLevelQuantity(makerSide, price).toFixed(8);
    const tuple: [string, string] = [price.toFixed(8), qty];
    if (makerSide === "BUY") bids.push(tuple);
    else asks.push(tuple);
  }

  if (takerRestingPrice) {
    const qty = book.getLevelQuantity(takerSide, takerRestingPrice).toFixed(8);
    const tuple: [string, string] = [takerRestingPrice.toFixed(8), qty];
    if (takerSide === "BUY") bids.push(tuple);
    else asks.push(tuple);
  }

  return { bids, asks };
}

export async function createOrder(
  accountId: string,
  input: CreateOrderInput
): Promise<OrderResponse> {
  const book = getOrderBook(input.symbol);
  const takerPrice = new Decimal(input.price);
  const takerQuantity = new Decimal(input.quantity);
  const takerId = uuidv7();

  const { asset: reserveAsset, amount: reserveAmount } = reservationFor(
    input.symbol,
    input.side,
    takerPrice,
    takerQuantity
  );

  await prisma.$transaction(async (tx) => {
    await reserveFunds(tx, accountId, reserveAsset, reserveAmount);
  });

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
        accountId,
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

      const makerOrder = await tx.order.findUniqueOrThrow({
        where: { id: fill.makerOrderId },
      });

      await settleFill(tx, {
        accountId: makerOrder.accountId,
        market: input.symbol,
        side: makerOrder.side,
        fillPrice: fill.price,
        fillQuantity: fill.quantity,
        isTaker: false,
        takerLimitPrice: null,
      });

      await settleFill(tx, {
        accountId,
        market: input.symbol,
        side: input.side,
        fillPrice: fill.price,
        fillQuantity: fill.quantity,
        isTaker: true,
        takerLimitPrice: takerPrice,
      });
    }

    return { order: created, trades: createdTrades };
  });

  // publish only after the transaction above has fully committed - never
  // broadcast anything that might still roll back. fire-and-forget, not
  // awaited - a publish failure never blocks or fails this response.
  for (let i = 0; i < fills.length; i++) {
    const fill = fills[i];
    const trade = trades[i];
    if (!fill || !trade) continue;

    const buyerOrderId = input.side === "BUY" ? takerId : fill.makerOrderId;
    const sellerOrderId = input.side === "BUY" ? fill.makerOrderId : takerId;
    const buyerIsMaker = input.side === "SELL";

    publishTrade({
      market: input.symbol,
      tradeId: trade.id,
      price: fill.price.toFixed(8),
      quantity: fill.quantity.toFixed(8),
      buyerOrderId,
      sellerOrderId,
      tradeTime: trade.createdAt.getTime(),
      buyerIsMaker,
    });
  }

  const depthUpdates = computeDepthUpdates(
    book,
    input.side,
    touchedMakers,
    takerRemainingQuantity.greaterThan(0) ? takerPrice : null
  );
  publishDepth({ market: input.symbol, ...depthUpdates });

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

export class OrderNotFoundError extends Error {
  constructor(orderId: string) {
    super(`order not found: ${orderId}`);
    this.name = "OrderNotFoundError";
  }
}

export type CancelOrderResponse = {
  symbol: Market;
  orderId: string;
  price: string;
  origQty: string;
  executedQty: string;
  status: OrderStatus;
};

export async function cancelOrder(symbol: Market, orderId: string): Promise<CancelOrderResponse> {
  const book = getOrderBook(symbol);

  const canceled = book.cancelOrder(orderId);
  if (!canceled) {
    throw new OrderNotFoundError(orderId);
  }

  const { asset: releaseAsset, amount: releaseAmount } = reservationFor(
    symbol,
    canceled.side,
    canceled.price,
    canceled.remainingQuantity
  );

  const order = await prisma.$transaction(async (tx) => {
    const existing = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    await releaseFunds(tx, existing.accountId, releaseAsset, releaseAmount);
    return tx.order.update({
      where: { id: orderId },
      data: { status: "CANCELED" },
    });
  });

  const remainingLevelQty = book.getLevelQuantity(canceled.side, canceled.price).toFixed(8);
  const tuple: [string, string] = [canceled.price.toFixed(8), remainingLevelQty];
  publishDepth({
    market: symbol,
    bids: canceled.side === "BUY" ? [tuple] : [],
    asks: canceled.side === "SELL" ? [tuple] : [],
  });

  const origQty = new Decimal(order.quantity.toString());
  const remainingQty = new Decimal(order.remainingQuantity.toString());
  const executedQty = origQty.minus(remainingQty);

  return {
    symbol,
    orderId: order.id,
    price: new Decimal(order.price.toString()).toFixed(8),
    origQty: origQty.toFixed(8),
    executedQty: executedQty.toFixed(8),
    status: order.status,
  };
}

export type OrderDetailResponse = {
  orderId: string;
  symbol: Market;
  side: "BUY" | "SELL";
  price: string;
  origQty: string;
  executedQty: string;
  status: OrderStatus;
  transactTime: number;
};

function toDetailResponse(order: {
  id: string;
  market: string;
  side: "BUY" | "SELL";
  price: { toString(): string };
  quantity: { toString(): string };
  remainingQuantity: { toString(): string };
  status: OrderStatus;
  createdAt: Date;
}): OrderDetailResponse {
  const origQty = new Decimal(order.quantity.toString());
  const remainingQty = new Decimal(order.remainingQuantity.toString());
  const executedQty = origQty.minus(remainingQty);

  return {
    orderId: order.id,
    symbol: order.market as Market,
    side: order.side,
    price: new Decimal(order.price.toString()).toFixed(8),
    origQty: origQty.toFixed(8),
    executedQty: executedQty.toFixed(8),
    status: order.status,
    transactTime: order.createdAt.getTime(),
  };
}

export async function getOrder(symbol: Market, orderId: string): Promise<OrderDetailResponse> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });

  if (!order || order.market !== symbol) {
    throw new OrderNotFoundError(orderId);
  }

  return toDetailResponse(order);
}

export async function getOpenOrders(
  accountId: string,
  symbol: Market | undefined
): Promise<OrderDetailResponse[]> {
  const orders = await prisma.order.findMany({
    where: {
      accountId,
      status: { in: ["NEW", "PARTIALLY_FILLED"] },
      ...(symbol ? { market: symbol } : {}),
    },
    orderBy: { createdAt: "asc" },
  });

  return orders.map(toDetailResponse);
}