# Order Lookup - Planning

## Functional Knowledge

Right now a `FILLED` or `CANCELED` order is invisible to any client - it only exists in `psql`. Two reads close this: a single order by id, and an account's currently-resting orders. No writes, no matching-engine interaction, no new concurrency story - straight reads against already-correct data.

## Identified Pattern

None of the 8 apply meaningfully beyond what already exists. This is the read half of scaling reads, already established by `getDepth` - not a new pattern, just a new query shape against the same table.

## Core Entities

None new. Both endpoints read `Order` as-is.

## Access Patterns

1. Single order by id + symbol → already indexed via the primary key, no new index needed.
2. Open orders per account (+ optional symbol filter) → filters `accountId` and `status IN (NEW, PARTIALLY_FILLED)`. This is a genuinely new query shape - nothing so far has queried `Order` by `accountId`. Needs an index; without one this table-scans once order volume grows, same reasoning as every prior indexed query in this project.

## Object Design / Concurrency

Neither applies - plain reads, no mutation, no shared state.

## Decision Log

1. `GET /api/v3/order` accepts the `X-Account-Id` header for shape consistency with the other trading endpoints, but does not enforce it against the order's actual owner → forced by the same no-ownership-enforcement stance already established for `DELETE` → rejected: enforcing ownership here, which would be the first place in this project reads are gated - inconsistent with every prior decision.
2. `GET /api/v3/openOrders` **does** require and use the header - unlike the single-order lookup, "open orders" has no meaning without an account to scope it to → not a new stance, just the one place account scope is actually load-bearing for a read.
3. New index `@@index([accountId, status])` on `Order` → forced by access pattern 2, the first read in this project that queries by account → rejected: no index, which was correct for every prior feature that never queried this way, wrong now that one does.

## Definition of Done

- `GET /api/v3/order` returns a `FILLED`/`CANCELED`/`NEW`/`PARTIALLY_FILLED` order correctly, 404 for unknown id
- `GET /api/v3/openOrders` returns only resting orders for the requesting account, correctly excludes other accounts' orders
- Optional `symbol` filter narrows correctly when provided
