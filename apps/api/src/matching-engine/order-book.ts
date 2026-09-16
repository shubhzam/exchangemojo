import { Decimal } from "decimal.js";
import type { Market, OrderSide } from "@repo/shared";

export type BookOrder = {
  id: string;
  side: OrderSide;
  price: Decimal;
  remainingQuantity: Decimal;
  createdAt: Date;
};

type PriceLevel = {
  price: Decimal;
  orders: BookOrder[];
};

export type Fill = {
  price: Decimal;
  quantity: Decimal;
  makerOrderId: string;
};

export type MatchResult = {
  fills: Fill[];
  takerRemainingQuantity: Decimal;
  touchedMakers: BookOrder[];
};

export class OrderBook {
  private bids: PriceLevel[] = [];
  private asks: PriceLevel[] = [];
  private byId: Map<string, BookOrder> = new Map();

  constructor(readonly market: Market) {}

  bestBid(): Decimal | null {
    return this.bids[0]?.price ?? null;
  }

  bestAsk(): Decimal | null {
    return this.asks[0]?.price ?? null;
  }

  // current total remaining quantity resting at one price level, 0 if
  // nothing rests there. depth events need a level's aggregate, not any
  // single order's amount - multiple orders can share a level.
  getLevelQuantity(side: OrderSide, price: Decimal): Decimal {
    const levels = side === "BUY" ? this.bids : this.asks;
    const level = levels.find((l) => l.price.equals(price));
    if (!level) return new Decimal(0);
    return level.orders.reduce((sum, o) => sum.plus(o.remainingQuantity), new Decimal(0));
  }

  addOrder(order: BookOrder): void {
    const levels = order.side === "BUY" ? this.bids : this.asks;
    const existing = levels.find((level) => level.price.equals(order.price));

    if (existing) {
      existing.orders.push(order);
    } else {
      const newLevel: PriceLevel = { price: order.price, orders: [order] };
      const insertAt = levels.findIndex((level) =>
        order.side === "BUY"
          ? level.price.lessThan(order.price)
          : level.price.greaterThan(order.price)
      );

      if (insertAt === -1) {
        levels.push(newLevel);
      } else {
        levels.splice(insertAt, 0, newLevel);
      }
    }

    this.byId.set(order.id, order);
  }

  match(
    taker: { side: OrderSide; price: Decimal },
    takerQuantity: Decimal
  ): MatchResult {
    const opposing = taker.side === "BUY" ? this.asks : this.bids;
    const fills: Fill[] = [];
    const touchedMakers: BookOrder[] = [];
    let remaining = takerQuantity;

    while (remaining.greaterThan(0) && opposing.length > 0) {
      const bestLevel = opposing[0];
      if (!bestLevel) break;

      const crosses =
        taker.side === "BUY"
          ? taker.price.greaterThanOrEqualTo(bestLevel.price)
          : taker.price.lessThanOrEqualTo(bestLevel.price);

      if (!crosses) break;

      const maker = bestLevel.orders[0];
      if (!maker) break;

      const matchedQty = Decimal.min(remaining, maker.remainingQuantity);

      fills.push({ price: bestLevel.price, quantity: matchedQty, makerOrderId: maker.id });
      maker.remainingQuantity = maker.remainingQuantity.minus(matchedQty);
      remaining = remaining.minus(matchedQty);
      touchedMakers.push(maker);

      if (maker.remainingQuantity.isZero()) {
        bestLevel.orders.shift();
        if (bestLevel.orders.length === 0) {
          opposing.shift();
        }
        this.byId.delete(maker.id);
      }
    }

    return { fills, takerRemainingQuantity: remaining, touchedMakers };
  }

  cancelOrder(orderId: string): BookOrder | null {
    const order = this.byId.get(orderId);
    if (!order) return null;

    const levels = order.side === "BUY" ? this.bids : this.asks;
    const levelIndex = levels.findIndex((level) => level.price.equals(order.price));
    const level = levelIndex === -1 ? undefined : levels[levelIndex];

    if (!level) {
      this.byId.delete(orderId);
      return null;
    }

    const orderIndex = level.orders.findIndex((o) => o.id === orderId);
    if (orderIndex === -1) {
      this.byId.delete(orderId);
      return null;
    }

    level.orders.splice(orderIndex, 1);
    if (level.orders.length === 0) {
      levels.splice(levelIndex, 1);
    }
    this.byId.delete(orderId);

    return order;
  }
}