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
  // id -> order, for O(1) cancel lookup. kept in sync with bids/asks by
  // every method that adds or removes an order - addOrder, match, cancelOrder.
  private byId: Map<string, BookOrder> = new Map();

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
        // fully filled - no longer cancelable, remove from the id index too,
        // or a later cancel against this id would look like it succeeded
        this.byId.delete(maker.id);
      }
    }

    return { fills, takerRemainingQuantity: remaining, touchedMakers };
  }

  // removes a resting order by id. returns the removed order, or null if
  // it isn't resting - already filled, already canceled, or never existed.
  // this class doesn't distinguish those; the caller decides what "not
  // found" means at the api level.
  //
  // synchronous, same requirement as match() - see planning doc §5.
  cancelOrder(orderId: string): BookOrder | null {
    const order = this.byId.get(orderId);
    if (!order) return null;

    const levels = order.side === "BUY" ? this.bids : this.asks;
    const levelIndex = levels.findIndex((level) => level.price.equals(order.price));
    const level = levelIndex === -1 ? undefined : levels[levelIndex];

    if (!level) {
      // byId and the price levels disagree - shouldn't happen, but don't
      // pretend the cancel worked if it can't actually be verified
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