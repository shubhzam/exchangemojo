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

  constructor(readonly market: Market) {}

  bestBid(): Decimal | null {
    return this.bids[0]?.price ?? null;
  }

  bestAsk(): Decimal | null {
    return this.asks[0]?.price ?? null;
  }

  addOrder(order: BookOrder): void {
    const levels = order.side === "BUY" ? this.bids : this.asks;
    const existing = levels.find((level) => level.price.equals(order.price));

    if (existing) {
      existing.orders.push(order);
      return;
    }

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
      // unreachable given the while condition above, but this is the
      // explicit check typescript needs to actually narrow the type -
      // a .length check elsewhere doesn't prove anything about this access
      if (!bestLevel) break;

      const crosses =
        taker.side === "BUY"
          ? taker.price.greaterThanOrEqualTo(bestLevel.price)
          : taker.price.lessThanOrEqualTo(bestLevel.price);

      if (!crosses) break;

      const maker = bestLevel.orders[0];
      // unreachable too - addOrder/the cleanup below never leaves an empty
      // level in the array - but same reasoning as above applies
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
      }
    }

    return { fills, takerRemainingQuantity: remaining, touchedMakers };
  }
}