# Place Order - Techspec

**Version targets:** zod 4.5.4, prisma 7.10.0, express 5.2.1

## Problem Statement

Persist limit orders and expose the resting order book per market. No matching, no balance checks, no order cancellation.

## Requirements

Functional:
- Accept a limit order (market, side, price, quantity) and persist it
- Return all OPEN orders for a market, split into bids (BUY, price descending) and asks (SELL, price ascending)

Non-functional:
- Reject invalid input before any database call
- Order book read must use an index-backed query, not a full table scan, as volume grows

## API Contract

Shape follows Binance's spot API conventions (paths, field names, status vocabulary), scoped to only what v1 supports - no fields for order types, time-in-force, or fill tracking that don't exist yet. See planning §6, decision 4.

**POST /api/v3/order**

Request:
```json
{ "symbol": "SOLUSDC", "side": "BUY", "price": "184.50", "quantity": "2.5" }
```
`price` and `quantity` are strings, not JSON numbers - JSON floats lose precision at the decimal places crypto quantities need. `symbol` has no separator, matching Binance exactly and matching the Prisma enum value character-for-character (see schema note below).

Response 201:
```json
{
  "orderId": "...",
  "symbol": "SOLUSDC",
  "side": "BUY",
  "price": "184.50000000",
  "quantity": "2.50000000",
  "status": "NEW",
  "transactTime": 1757520000000
}
```
`status: "NEW"` means accepted and resting, untouched by matching - matches Binance's own semantics for an order in this state. `transactTime` is epoch milliseconds, not an ISO string.

Response 400 (validation failure):
```json
{ "error": "invalid_input", "details": [ { "path": ["symbol"], "message": "..." } ] }
```

Response 503 (infra failure):
```json
{ "error": "database_unavailable" }
```

**GET /api/v3/depth?symbol=SOLUSDC**

Response 200:
```json
{
  "symbol": "SOLUSDC",
  "bids": [ ["184.50000000", "2.50000000"] ],
  "asks": [ ["185.00000000", "1.00000000"] ]
}
```
Each entry is a `[price, quantity]` string tuple, not an object - matches Binance's depth endpoint exactly. Bids sorted price descending, asks price ascending.

Response 400 (invalid or missing symbol param): same shape as the POST validation error.

## Schema

```prisma
enum Market {
  SOLUSDC
  ETHUSDC
  BTCUSDC
}

enum OrderSide {
  BUY
  SELL
}

enum OrderStatus {
  OPEN
}

model Order {
  id        String      @id @default(uuid(7))
  market    Market
  side      OrderSide
  price     Decimal     @db.Decimal(18, 8)
  quantity  Decimal     @db.Decimal(18, 8)
  status    OrderStatus @default(OPEN)
  createdAt DateTime    @default(now())

  @@index([market, status, price])
}
```

Precision: `Decimal(18, 8)` - 8 decimal places covers BTC's satoshi-level precision (1e-8); anything coarser breaks at any real quantity below 1 unit.

Index: `(market, status, price)` serves the order-book read access pattern (planning §4.2) directly - without it, that query is a full table scan the moment order volume grows past a handful of rows.

Wire format and enum value are character-identical (`"SOLUSDC"` on the wire, `SOLUSDC` in Postgres) - no translation layer between them, unlike the original hyphenated design.

## Edge Cases

- Invalid market string → 400, rejected by Zod before any query
- Non-positive price or quantity → 400, rejected by Zod refinement
- **Postgres unreachable during insert → 503 with `database_unavailable`, not a generic 500 or a hang** (infra failure mode)
- Two orders with identical market/side/price/quantity submitted concurrently → not a conflict; both persist independently, no uniqueness constraint applies

## Non-Goals

Order matching, balance/fund reservation, order cancellation, status transitions beyond OPEN, authentication/ownership, market orders, pagination on the order book read
