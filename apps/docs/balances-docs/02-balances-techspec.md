# Balances - Techspec

**Version targets:** zod 4.5.4, prisma 7.10.0, express 5.2.1 (unchanged)

## Problem Statement

Introduce accounts and per-asset balances, wire fund reservation into order placement, settlement into matching, and release into cancellation. No deposit/withdraw, no auth.

## Requirements

Functional:
- BUY reserves `price × quantity` quote-asset; SELL reserves `quantity` base-asset
- Insufficient funds rejects before matching runs
- Fill settlement moves `locked` correctly on both maker and taker sides, refunding BUY-taker overpayment only
- Cancel releases the canceled order's remaining locked amount

Non-functional:
- Reservation is one atomic conditional `UPDATE` - correctness from Postgres, not application locking
- Cancellation always credits the order's stored `accountId`, never the request header

## API Contract

**POST /api/v1/accounts** - not Binance-shaped (real Binance accounts pre-exist via signup; this is a v1-prefixed testing utility, not a v3 endpoint). Optional starting balances for any asset, defaults to zero.

Request:
```json
{ "balances": { "USDC": "1000", "SOL": "10" } }
```

Response 201:
```json
{
  "accountId": "...",
  "balances": [
    { "asset": "USDC", "free": "1000.00000000", "locked": "0.00000000" },
    { "asset": "SOL", "free": "10.00000000", "locked": "0.00000000" },
    { "asset": "ETH", "free": "0.00000000", "locked": "0.00000000" },
    { "asset": "BTC", "free": "0.00000000", "locked": "0.00000000" }
  ]
}
```
Always returns all 4 assets, not just non-zero ones - only 4 exist, unlike Binance's real thousands-of-assets case where that would be unwieldy.

**GET /api/v3/account** - real Binance path. Header: `X-Account-Id: <uuid>`.

Response 200: same `balances` array shape as above.
Response 400: missing/malformed header.
Response 404: header doesn't match a real account.

**POST /api/v3/order** - contract extends further. Requires `X-Account-Id` header now - load-bearing, determines whose funds reserve.

New response 400 (insufficient funds):
```json
{ "error": "insufficient_funds", "asset": "USDC", "required": "369.00000000", "available": "200.00000000" }
```

**DELETE /api/v3/order** - requires the header for shape consistency across trading endpoints, but it is **not** used to determine fund direction - see planning decision 6. Funds always release to the order's own stored `accountId`.

## Schema

```prisma
enum Asset {
  USDC
  SOL
  ETH
  BTC
}

model Account {
  id        String   @id @default(uuid(7))
  createdAt DateTime @default(now())

  balances Balance[]
  orders   Order[]
}

model Balance {
  accountId String
  asset     Asset
  free      Decimal @default(0) @db.Decimal(18, 8)
  locked    Decimal @default(0) @db.Decimal(18, 8)

  account Account @relation(fields: [accountId], references: [id])

  @@id([accountId, asset])
}
```

`Order` gains one field:
```prisma
model Order {
  // ...existing fields unchanged...
  accountId String
  account   Account @relation(fields: [accountId], references: [id])
}
```
No new index on `Order.accountId` - nothing in this feature's access patterns queries orders by account (planning §4); a future order-lookup feature adds it when it actually needs it, same discipline as `Trade` in Order Matching.

## Edge Cases

- BUY reservation math: `price × quantity`, not `quantity` alone - the quote-asset cost, not the base-asset amount
- SELL reservation math: `quantity` alone, in the base asset - price-independent, this is the source of the refund asymmetry (planning decision 5)
- Fill at a better price than a BUY taker's limit → excess locked USDC refunds to `free`; a SELL taker or any maker never triggers this branch
- Cancel of a `PARTIALLY_FILLED` order → releases only the still-`remainingQuantity` portion, computed from the order's own stored fields
- **Postgres unreachable during reservation → 503, same accepted-risk shape as prior features, but here it fails *before* any book state changes - cleaner than the matching/cancel failure modes, since nothing optimistic has happened yet**
- Two concurrent orders against the same account/asset exceeding combined funds → Postgres's row-level lock serializes the two `UPDATE`s; the second sees the first's already-decremented `free` and correctly fails if now insufficient

## Non-Goals

Real deposit/withdraw (starting balances are a testing convenience only), authentication/ownership enforcement on cancel, multi-currency conversion, margin/leverage, fees
