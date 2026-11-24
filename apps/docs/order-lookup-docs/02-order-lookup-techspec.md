# Order Lookup - Techspec

**Version targets:** unchanged from prior features.

## Problem Statement

Two read endpoints: single order by id, and an account's open orders. No writes.

## API Contract

**GET /api/v3/order?symbol=SOLUSDC&orderId=...**

Response 200:
```json
{
  "orderId": "...", "symbol": "SOLUSDC", "side": "BUY",
  "price": "184.50000000", "origQty": "2.50000000",
  "executedQty": "1.00000000", "status": "PARTIALLY_FILLED",
  "transactTime": 1757520000000
}
```
No `fills` array - that's specific to `POST`'s immediate execution report, not a stored-state read (matches Binance's real response shape). No `updateTime` - this project doesn't track it; adding it would mean a new schema column for a field nothing else needs yet.

Response 404: `{ "error": "order_not_found" }` - unknown id or wrong symbol for that id.

**GET /api/v3/openOrders?symbol=SOLUSDC** (symbol optional - omitted returns across all markets)

Header: `X-Account-Id` - **load-bearing here**, unlike the single-order endpoint.

Response 200: array of the same order shape as above, filtered to `status IN (NEW, PARTIALLY_FILLED)` for the requesting account only.

## Schema

```prisma
model Order {
  // ...existing fields unchanged...
  @@index([accountId, status])
}
```
One new index, added alongside the existing `@@index([market, status, price])` - not replacing it, both serve different queries.

## Edge Cases

- `orderId` exists but for a different `symbol` than requested → 404, not a silent mismatch
- Account with zero open orders → `[]`, not an error
- `GET /api/v3/order` requested with a mismatched `X-Account-Id` (not the order's real owner) → still returns the order, per planning decision 1

## Non-Goals

`GET /api/v3/allOrders` (full history including terminal orders, paginated) - meaningfully more work (pagination, time-range filtering) for a Binance endpoint this project doesn't need yet, `myTrades` (trade history) - same reasoning as it was deferred in Order Matching
