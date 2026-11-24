# Balances - Planning

## Functional Knowledge

Every order placed so far has been free - nothing checks whether the placing account can actually afford it. This feature closes that hole: an `Account` holds a `Balance` per asset (`free` + `locked`), order placement atomically reserves funds before the order ever reaches matching, a fill converts the reservation into a real balance change, and a cancel releases whatever's still locked back to `free`.

This requires an owner, which nothing in this project has had until now - Place Order deferred it, and it's been re-stated as a standing non-goal twice since. `Account` here is bare: an id, nothing else. No password, no session - a caller identifies itself via an `X-Account-Id` header, honestly unauthenticated, structurally similar to how Binance's own API-key header works, minus the signature behind it.

## Identified Pattern

**Scarcity, not the contention class Order Matching solved.** A balance row is a limited resource multiple concurrent order placements for the same account/asset could race over - but unlike the order book, a balance row is touched once per order, not read on every match check, so it doesn't need to live in memory. Postgres's own row-level locking handles this correctly via a single atomic conditional `UPDATE`, with no new application-level mechanism needed. Worth being explicit that this is a deliberate departure from the book's in-memory-singleton design, not an inconsistency - different resource, different correct answer.

## Core Entities

`Account`: bare id, a real entity but a thin one. `Balance`: one row per (account, asset) pair, holding `free` and `locked` - a real entity with its own identity, but its identity *is* that pair, not a surrogate id (see decision log). `Asset` is a fixed 4-value set (`USDC`, `SOL`, `ETH`, `BTC`) - same reasoning as `Market` being a fixed enum, no lifecycle, never created or deleted by users.

What looked like an entity but isn't: a separate `Reservation` ledger row. The locked amount for any order is fully derivable from that order's own stored `side`, `price`, and `remainingQuantity` at release or settlement time - inventing a persisted reservation record would duplicate information `Order` already carries.

## Access Patterns

1. Reserve on placement: one atomic conditional update on a single `(accountId, asset)` row - `free -= amount WHERE free >= amount`. Zero rows affected means insufficient funds, checked and rejected before the order ever reaches the matching engine.
2. Release on cancel: one update, computed from the canceled order's own remaining fields - no lookup elsewhere needed.
3. Settle on fill: folded into the existing match-persistence transaction, touching both sides of every fill.
4. Read: `GET /api/v3/account` - all four asset balances for one account, one query.

## Object Design

No new pattern. A `balance-service.ts` holds `reserveFunds`, `releaseFunds`, `settleFill` - kept separate from `order-service.ts` so the asset-determination and refund math live in one place, not inlined into the order flow.

## Concurrency

Reservation's correctness comes entirely from Postgres's native MVCC row locking, not from anything in application code - two concurrent reservation attempts against the same row serialize at the database level automatically. Settlement never needs its own atomicity check the way reservation does: by the time a fill settles, the funds it's moving were already verified and locked at placement - it's relocating money that's provably there, not re-checking a constraint.

## Decision Log

1. `Balance` keyed by composite `(accountId, asset)`, no surrogate id → forced by that pair being the balance's actual natural identity → rejected: a uuid id, pure overhead for an entity whose real identity already exists.
2. Reservation via atomic Postgres `UPDATE`, not an in-memory structure → forced by balance rows being touched once per order, not read at match-check speed → rejected: mirroring the `OrderBook` singleton pattern here, unneeded complexity for a resource that doesn't need to be fast.
3. No separate reservation ledger entity → forced by the locked amount being fully derivable from `Order`'s own fields → rejected: a persisted reservation row duplicating what `Order` already stores.
4. Funds are reserved *before* the synchronous match block starts, not inside it → forced by reservation needing an `await` for the DB check, which cannot sit inside `match()`'s uninterrupted sequence → locks in: check funds first, only begin the book's synchronous stretch once reservation succeeds → rejected: reserving mid-match, structurally impossible without an await inside the one block that can't have one.
5. Overpayment refund applies only to a BUY taker executing better than its own limit - never a SELL taker, never any maker → forced by working the settlement math precisely by hand, not the looser "takers can overpay" framing → rejected: a generic refund check on every settlement path, dead code on three of four branches.
6. Cancellation releases funds to the order's own stored `accountId`, never to whatever `X-Account-Id` header the canceller sends → forced by money correctness, not an auth concern → rejected: trusting the request header for fund direction on cancel, which could misdirect released funds to the wrong account even in this unauthenticated system.
7. Wire and DB field names are `free`/`locked`, matching Binance exactly → forced by the established wire-equals-DB-field principle → rejected: `available`/`reserved`, reintroducing a translation layer for no reason once the real vocabulary is confirmed.

## Where This Breaks First / Open Questions

Existing `Order`/`Trade` test rows have no account to attach to - `Order.accountId` becomes a new required column with nothing to backfill it from. Same shape as `remainingQuantity`'s migration problem. Proposing the same resolution: clear the test rows (`Order` and `Trade`, in that order for the foreign key), since they're testing debris, not real data - confirm before the migration runs.

## Definition of Done

- Placing a BUY reserves quote-asset funds; placing a SELL reserves base-asset funds
- Insufficient `free` balance rejects the order before it reaches matching - book untouched
- A fill correctly moves `locked` → spent/received on both sides, with the BUY-taker refund applied only where it actually applies
- Canceling a resting order releases exactly its remaining locked amount back to `free`
- Concurrency check: two concurrent orders against the same account/asset that together exceed funds - only the affordable one(s) succeed, never an over-commit
- `GET /api/v3/account` correctly reflects `free`/`locked` after a sequence of place/fill/cancel operations
