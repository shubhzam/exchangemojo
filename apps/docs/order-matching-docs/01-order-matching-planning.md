# Order Matching - Planning

## Functional Knowledge

When an order arrives, it now checks against resting liquidity on the opposite side of the same market's book before resting itself. If its price crosses the best opposing price, it matches - fully or partially - in price-time priority against resting orders, oldest first at the best price. Matched quantity produces a `Trade`. Any unmatched remainder of the incoming order rests as before. Resting orders fully consumed become `FILLED`; partially consumed ones become `PARTIALLY_FILLED` with a reduced remaining quantity. This must exist before realtime streaming or a market-maker bot can be built - both depend on real fills happening somewhere first.

Scope, confirmed: matching only. No Kafka, no websocket fanout, no persistence consumer - those are a later feature once this algorithm is proven. Persistence here stays synchronous, same pattern as Place Order.

## Identified Pattern

**Contention is the core concern of this feature** - the first time it's applied in this project. Two orders for the same market arriving as concurrent requests must be processed against the same in-memory book state without racing. Scaling reads applies too: the order-book read must now reflect `remainingQuantity`, not original quantity, for partially-filled resting orders - reusing Place Order's read query unmodified would silently show stale liquidity.

## Core Entities

`Trade` is new: an immutable execution record - maker order (the resting side), taker order (the incoming side that crossed), price, quantity. Maker/taker isn't speculative - every match inherently has both, independent of whether fees exist later. `Order` gains a denormalized `remainingQuantity`, kept separate from the original `quantity` so matching can read it in O(1) without summing trades on every check. The in-memory `OrderBook` per market looked like it might be an entity but isn't - it's a derived, rebuildable structure, not a system of record; Postgres remains that.

## Access Patterns

1. Match check: read best opposing price for a market → O(1) against a sorted in-memory structure, not a query - this is why the book has to live in memory at all.
2. Order-book read: same as Place Order, but must filter `status IN (NEW, PARTIALLY_FILLED)` and display `remainingQuantity`, not `quantity`.

## Object Design

One `OrderBook` instance per market, held as a process-level **Singleton** in a `Map<Market, OrderBook>` - exactly one writer per market's state is the whole point; re-deriving the book from a DB query per request would defeat it. No State Machine pattern for `OrderStatus` - three states, transitions only ever produced by the match loop itself, no cancel/expire yet to create branching logic. A couple of clear conditionals cover it; a formal state machine adds no protection here.

## Concurrency

The centerpiece of this feature. Correctness requirement: no double-matching the same resting liquidity against two concurrent incoming orders. Mechanism: the entire read-compute-mutate sequence for one order's match must be synchronous - no `await` inside it - so Node's single-threaded event loop can't interleave another request mid-match. This forces in-memory mutation to happen *before* the durable write, not after (see decision log). Scarcity: not a concern - one Prisma pool, one transactional write per order, nothing unusual.

## Decision Log

1. Synchronous, in-process matching, persistence not deferred to Kafka → forced by the earlier trigger-model decision → locks in one request handler doing read→match→mutate→persist end to end → rejected: Kafka pipeline, right eventually (next feature), wrong now.
2. In-memory mutation before the Postgres write → forced by concurrency analysis (§6) - only a fully synchronous sequence gets correctness for free from the event loop → locks in an accepted risk: a DB write failure after mutation leaves memory briefly ahead of durable state until restart/rebuild → rejected: DB-write-first, safer-looking but reopens the exact race the synchronous design exists to avoid.
3. One `OrderBook` singleton per market → forced by needing exactly one writer per market → rejected: rebuilding the book from Postgres per request, too slow for the one thing this structure exists to make fast.
4. `remainingQuantity` denormalized on `Order` → forced by the O(1) match-check access pattern → rejected: summing `Trade` rows live, correct but wrong for a hot path.

## Where This Breaks First / Open Questions

Breaks first: horizontal scaling of the API process. Two instances mean two independent in-memory books with no shared writer guarantee - this design assumes exactly one process. Also breaks on restart if not handled: the book must rebuild from Postgres (all `NEW`/`PARTIALLY_FILLED` orders per market) on boot, or resting liquidity silently vanishes.

Open question already flagged above: accepting the in-memory-ahead-of-DB risk from decision 2. Confirm before code, or say if you want the safer-but-slower ordering instead.

## Definition of Done

- Crossing orders produce a trade with correct fill quantities and correct final statuses on both sides
- Incoming order larger than best-price liquidity partially fills and rests the remainder at its own price
- Order-book read correctly shows `remainingQuantity` and excludes `FILLED` orders
- `POST /api/v3/order` response includes `fills`, `status`, `executedQty` when a match occurs
- Concurrency check: two near-simultaneous orders against overlapping liquidity never oversell it
- Infra check: DB down still returns a clean 503 on order creation
- Restart check: resting orders survive an API process restart via book rebuild from Postgres
