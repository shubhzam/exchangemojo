# Realtime Streaming - Planning

## Functional Knowledge

Right now, seeing a book or trade change means polling `GET /api/v3/depth` repeatedly - wasteful and laggy. This feature makes it push-based: any book-changing operation (place, match, cancel) publishes an event to Kafka; a websocket gateway consuming those events fans them out to clients subscribed to that market's stream. Public market data only, per the earlier scope decision - no account-specific data, no auth, matching Binance's real `<symbol>@trade` and `<symbol>@depth` streams rather than their authenticated user-data stream.

This is the first genuinely new architectural shape in the project - everything before this has been request/response. A push channel exists independently of any single HTTP request's lifecycle, which changes what "correct" even means here: there's no client waiting on a response to this, just a best-effort broadcast of something that already happened.

## Identified Pattern

Realtime updates and a multi-step process (publish, then separately, fan out) - a new pattern category for this project, not a reapplication of an existing one.

## Core Entities

No new persisted entity - these are transient messages, published and consumed, never stored. The in-memory websocket connection registry (which sockets are subscribed to which symbol+stream) is new process state, shaped like the `OrderBook` singleton (one shared, mutated structure) but unrelated in purpose - connections come and go with the process's own lifecycle, nothing to rebuild from Postgres on restart the way the order book is.

## Access Patterns

1. Publish: after a DB transaction commits - never before, only broadcast already-durable truth - fire-and-forget a Kafka message. A publish failure doesn't fail the request; the order is already correctly persisted, and a missed broadcast is recoverable via a normal REST poll, not a correctness bug.
2. Consume + fan out: the gateway's Kafka consumer reads both topics continuously, looks up the connection registry for that symbol+stream, writes to every matching open socket.

## Object Design

An in-memory connection registry - `Map<streamKey, Set<WebSocket>>` - mutated on connect/disconnect, read on every consumed Kafka message. New helper on `OrderBook`: `getLevelQuantity(side, price)`, since depth events need a price level's current aggregate quantity, not a per-order amount - multiple orders can share a level (price-time priority's FIFO), and that aggregation is the book's own structure to expose, not something the service layer should reach in and compute by hand.

## Decision Log

1. Two Kafka topics, mirroring Binance's real separation of `@trade` and `@depth` → forced by them being genuinely different event types with different natural consumers → rejected: one combined topic, forcing a trade-only subscriber to filter out depth noise for no reason.
2. Topics partitioned by market → forced by wanting per-market event ordering, which Kafka only guarantees within a partition → rejected: a single partition, which would still work at this project's actual volume but teaches the wrong lesson - this is deliberate correctness, not a response to current load.
3. Depth events carry a price level's new total quantity, not a per-order delta → forced by multiple orders sharing a level → locks in the new `getLevelQuantity` helper → rejected: per-order amounts, meaningless to a client trying to maintain a correct local book from deltas alone.
4. Publish happens after the transaction commits, fire-and-forget → forced by only ever wanting to broadcast durable truth, and not wanting Kafka's health to gate a successful order's response latency → rejected: publishing inside the transaction, or awaiting it before responding.
5. Raw single-stream websocket connections only (`/ws/<symbol>@depth`), no combined multi-stream subscribe protocol → forced by wanting the core Kafka→fanout pattern proven first → rejected: Binance's full subscribe/unsubscribe protocol, a real feature, not needed to teach the underlying pattern.
6. Update-ID sequence numbers (Binance's `U`/`u` gap-detection fields) dropped entirely → forced by keeping this feature about the core pattern, not a second layer of protocol reliability engineering → rejected: implementing them, genuinely valuable but more than this round needs.
7. Websocket gateway lives inside `apps/api`, not a separate turborepo app → already agreed before writing this doc, restated for the record → rejected: a separate `apps/ws-gateway`, correct at real production scale, unneeded ceremony for what this feature actually teaches.

## Where This Breaks First / Open Questions

If `apps/api` is ever horizontally scaled - already a stated limitation from Order Matching - the connection registry breaks the same way the order book would: a client connected to instance A never sees an event published by a match processed on instance B. Not a new limitation, the same one, applied again.

No reconnect/backfill story: a client that disconnects and reconnects has no way to know what it missed. Binance's real clients solve this via a documented snapshot-then-buffer-then-replay procedure that depends on the `U`/`u` sequencing decision 6 explicitly drops - so this is a named consequence of that decision, not a separate gap.

## Definition of Done

- An order that rests publishes a depth event with the correct new price-level quantity
- A match publishes a trade event with correct maker/taker-derived buyer/seller order ids and the buyer-is-maker flag
- A cancel publishes a depth event correctly reflecting the level's reduced or removed quantity
- A client connected to `<symbol>@depth` receives only that symbol's depth events, never another market's
- A client connected to `<symbol>@trade` receives only that symbol's trade events
- Kafka or the gateway being down doesn't break order placement or cancellation - REST keeps working independently
