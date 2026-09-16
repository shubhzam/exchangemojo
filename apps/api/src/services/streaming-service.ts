import { kafkaProducer, ensureProducerConnected, TRADE_TOPIC, DEPTH_TOPIC } from "../lib/kafka.js";
import type { Market } from "@repo/shared";

type TradeEvent = {
  e: "trade";
  E: number;
  s: Market;
  t: string;
  p: string;
  q: string;
  b: string;
  a: string;
  T: number;
  m: boolean;
};

type DepthLevel = [string, string];

type DepthEvent = {
  e: "depthUpdate";
  E: number;
  s: Market;
  b: DepthLevel[];
  a: DepthLevel[];
};

async function publish(topic: string, key: string, value: unknown): Promise<void> {
  try {
    await ensureProducerConnected();
    await kafkaProducer.send({
      topic,
      messages: [{ key, value: JSON.stringify(value) }],
    });
  } catch (err) {
    console.error(`kafka publish failed (topic=${topic}):`, err);
  }
}

export function publishTrade(params: {
  market: Market;
  tradeId: string;
  price: string;
  quantity: string;
  buyerOrderId: string;
  sellerOrderId: string;
  tradeTime: number;
  buyerIsMaker: boolean;
}): void {
  const event: TradeEvent = {
    e: "trade",
    E: Date.now(),
    s: params.market,
    t: params.tradeId,
    p: params.price,
    q: params.quantity,
    b: params.buyerOrderId,
    a: params.sellerOrderId,
    T: params.tradeTime,
    m: params.buyerIsMaker,
  };
  void publish(TRADE_TOPIC, params.market, event);
}

export function publishDepth(params: {
  market: Market;
  bids: DepthLevel[];
  asks: DepthLevel[];
}): void {
  const event: DepthEvent = {
    e: "depthUpdate",
    E: Date.now(),
    s: params.market,
    b: params.bids,
    a: params.asks,
  };
  void publish(DEPTH_TOPIC, params.market, event);
}