# Realtime Streaming - Techspec

**Version targets:** `@confluentinc/kafka-javascript` 1.3.0 (not `kafkajs` - confirmed unmaintained, no release in over a year; Confluent's client is the maintained replacement and deliberately mirrors its API via its `.KafkaJS` export). `ws` - verify current version at install, standard minimal Node websocket server, no reason to expect drift. Kafka broker: official `apache/kafka` image, KRaft mode (`KAFKA_PROCESS_ROLES: broker,controller`, no separate Zookeeper container).

## Problem Statement

Publish book/trade changes to Kafka; a websocket gateway inside `apps/api` consumes both topics and fans out to subscribed clients. Public market data only.

## Kafka Topics

- `trade-events` - one message per fill
- `depth-events` - one message per price-level change

Both partitioned by market (3 partitions, keyed by symbol) - per-market ordering guaranteed within a partition, not across the topic as a whole.

## Message Shapes

Scoped from Binance's real websocket payloads - single-letter keys matching their convention, fields dropped where this project has no real data behind them.

**Trade event** (from `trade-events`, also what `<symbol>@trade` websocket clients receive):
```json
{
  "e": "trade", "E": 1757520001000, "s": "SOLUSDC",
  "t": "<tradeId>", "p": "184.50000000", "q": "1.00000000",
  "b": "<buyer's orderId>", "a": "<seller's orderId>",
  "T": 1757520000900, "m": true
}
```
`E` is publish time, `T` is the trade's actual execution time (`Trade.createdAt`) - kept distinct since they can differ slightly. `b`/`a` derived from maker/taker + each order's `side`, not stored fields - whichever order has `side: BUY` is the buyer. `m` is true when the maker was the buyer. Binance's `M` field (documented by Binance itself as "ignore") is dropped - no reason to reproduce a field with no meaning.

**Depth event** (from `depth-events`, also what `<symbol>@depth` websocket clients receive):
```json
{
  "e": "depthUpdate", "E": 1757520001000, "s": "SOLUSDC",
  "b": [["184.50000000", "1.50000000"]],
  "a": []
}
```
Each tuple is `[price, newTotalQuantityAtThatLevel]` - `"0.00000000"` means the level is now empty, matching Binance's own convention for "remove this level." No `U`/`u` sequence ids (decision 6).

## Websocket Contract

`ws://localhost:4000/ws/<symbol>@depth` and `ws://localhost:4000/ws/<symbol>@trade` - raw single-stream connections only, no combined-stream subscribe protocol. Connecting to an unknown symbol or malformed stream name closes the connection immediately with a close code, not a silent no-op.

## Producer Wiring

`createOrder` and `cancelOrder` each publish after their `prisma.$transaction` resolves successfully - never inside the transaction callback, never awaited before the HTTP response returns. A publish failure is caught and logged, not surfaced to the client.

## Edge Cases

- Kafka broker unreachable at publish time → caught, logged, request still returns its normal success response (decision 4)
- A websocket client connects to a stream for a market with no current activity → connection succeeds, simply receives nothing until an event occurs
- A price level fully empties (last order at that level matched or canceled) → depth event still fires, with `"0.00000000"` as the quantity - this is the removal signal, not an omission
- Gateway process restart → no backfill, no replay (decision 6's named consequence) - a reconnecting client simply resumes from whatever happens next

## Non-Goals

Private/authenticated user-data stream (account-specific order and balance updates - explicit scope decision, separate future feature), combined multi-stream subscribe/unsubscribe protocol, `U`/`u` update-id sequencing and gap detection, a separate `apps/ws-gateway` turborepo app, any frontend consumption of this stream (verified via a raw websocket client for this feature, not a UI)
