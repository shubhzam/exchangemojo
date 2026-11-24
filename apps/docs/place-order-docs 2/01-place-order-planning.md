# Place Order - Planning

## Functional Knowledge

Place Order lets a client submit a limit order for one of the three fixed markets and immediately see it appear in that market's resting order book. Nothing matches yet - an order placed here just sits as `OPEN` until a future matching-engine feature picks it up. This feature must exist before matching can be built, since matching needs orders to read. Building order-book display before persistence means displaying nothing real; building matching before persistence has nothing to match against - the sequence isn't arbitrary.

## Identified Pattern

Scaling reads applies: the order-book read will be polled repeatedly (by this feature's own endpoint now, by the matching engine and any realtime feed later), so it's the one access pattern earning an index. Scaling writes doesn't apply yet - order creation is a single independent insert with no contention. Realtime updates, long-running tasks, proximity, and large blobs don't apply to this feature; they may apply to features built on top of it.

## Core Entities

`Order` is the one real entity: a limit order, uniquely identified by a surrogate id (no natural key - two orders can share every visible attribute), owned by no one yet (see open questions). `Market` looked like an entity but isn't - it's a fixed 3-value set with no lifecycle, no create/update/delete, so it lives as a validated union in code, not a row in a table.

## Access Patterns

1. Write: create order → single insert, no read-before-write, low relative frequency.
2. Read: get order book for a market → filter `(market, status=OPEN)` → result set bounded by resting liquidity (expect low hundreds at this stage) → hot, since every future matching-engine tick and UI poll hits this. This is the one indexed pattern in the techspec.

## Object Design

None. Plain functions in a thin route handler plus a services layer holding validation and the Prisma call - no object graph complex enough to need a pattern.

## Concurrency

Not a concern for this feature. Each order insert is independent; there's no shared counter, no read-modify-write, no resource under contention. This changes the moment the matching engine exists.

## Decision Log

1. Market as a code-level union, not a table → forced by core-entities analysis (§3) → locks in a Prisma enum column with no FK, no join → rejected: a `markets` table, wrong at any scale for 3 values that never change.
2. Limit orders only, no order-type field yet → forced by functional knowledge - a market order has no meaning without something to match against → locks in `price` as required, non-nullable → rejected: adding a `type` discriminator now, right eventually (once matching exists), wrong now.
3. `Order.market` as a Prisma-level enum → forced by the fixed 3-value set → locks in DB-level rejection of invalid markets independent of the API layer → rejected: free-text string validated only by Zod, wrong at any scale since a raw DB write bypasses it entirely.
4. API shape follows Binance's conventions, scoped to v1 only → forced by an explicit request to build transferable muscle memory against a real exchange's API → locks in Binance's paths (`/api/v3/order`, `/api/v3/depth`), field names (`orderId`, `symbol`, `transactTime`), status vocabulary (`NEW`), tuple-array order book, and no-separator symbols (`SOLUSDC`) → rejected: full fidelity including fields like `timeInForce`/`type`/`executedQty` that only mean something once market orders and matching exist - those would be dead decoration, not real API surface, until those features land.
5. Symbol format with no separator (`SOLUSDC`) → forced by decision 4 → locks in wire format and Prisma enum value being character-identical, which eliminates the wire↔DB translation layer entirely → rejected: keeping the hyphen, which would have required a permanent mapping layer for no benefit once Binance-style symbols were adopted.

## Where This Breaks First / Open Questions

Breaks first: order book read table-scans once resting orders per market reach the low thousands, without the composite index this feature adds. Single point of failure: none new - the API's already-established Postgres dependency.

Open question to confirm before code: **should `Order` carry an owner field now?** No auth exists yet. Leaning toward no field at all - add `ownerId` later via the expand-contract pattern once auth lands, rather than adding an unenforced placeholder field now that implies a relationship that doesn't exist. Confirm before the schema gets written.

## Definition of Done

- `POST /orders` persists a valid limit order and returns 201 with the created row
- Invalid market, non-positive price, or non-positive quantity returns 400 before any DB call
- `GET /markets/:market/orders` returns bids and asks correctly sorted
- Infra check: stop Postgres mid-request, confirm the create endpoint returns a distinct 503, not a generic 500 or a hang
