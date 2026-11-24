# Order Matching - Techspec

**Version targets:** zod 4.5.4, prisma 7.10.0, express 5.2.1 (unchanged from Place Order)

## Problem Statement

Extend order placement to match against resting opposite-side liquidity in price-time priority before resting. Produces `Trade` records. No Kafka, no websocket fanout, no persistence consumer - synchronous only, same durability pattern as Place Order.

## Requirements

Functional:
- Incoming order matches against best-priced resting orders on the opposite side, oldest first at each price level
- Partial fills supported on both maker and taker sides
- Trade execution price is always the **maker's** price, not the taker's limit price - standard price-time-priority rule
- In-memory book rebuilds correctly from Postgres on process start

Non-functional:
- Match computation for one order must be fully synchronous - no `await` between reading book state and mutating it
- Order-book read must reflect `remainingQuantity`, not original `quantity`, for resting orders

## API Contract

**POST /api/v3/order** - contract evolves from Place Order, not a new endpoint. Response now includes execution results when a match occurs.

Request: unchanged from Place Order.

Response 201 (no match - rests as before):
```json
{
  "orderId": "...", "symbol": "SOLUSDC", "side": "BUY",
  "price": "184.50000000", "origQty": "2.50000000",
  "executedQty": "0.00000000", "status": "NEW",
  "fills": [], "transactTime": 1757520000000
}
```
Note `quantity` is renamed `origQty` here - once partial fills exist, "quantity requested" and "quantity executed" are genuinely different numbers and need different field names. This is a breaking change to Place Order's shipped response shape.

Response 201 (fully matched):
```json
{
  "orderId": "...", "symbol": "SOLUSDC", "side": "SELL",
  "price": "184.00000000", "origQty": "1.00000000",
  "executedQty": "1.00000000", "status": "FILLED",
  "fills": [ { "price": "184.50000000", "qty": "1.00000000", "tradeId": "..." } ],
  "transactTime": 1757520000000
}
```

**GET /api/v3/depth?symbol=SOLUSDC** - query changes, response shape unchanged: filters `status IN (NEW, PARTIALLY_FILLED)`, tuple values use `remainingQuantity` instead of `quantity`.

## Schema

```prisma
enum OrderStatus {
  NEW
  PARTIALLY_FILLED
  FILLED
}

model Order {
  id                String      @id @default(uuid(7))
  market            Market
  side              OrderSide
  price             Decimal     @db.Decimal(18, 8)
  quantity          Decimal     @db.Decimal(18, 8)
  remainingQuantity Decimal     @db.Decimal(18, 8)
  status            OrderStatus @default(NEW)
  createdAt         DateTime    @default(now())

  makerTrades Trade[] @relation("MakerOrder")
  takerTrades Trade[] @relation("TakerOrder")

  @@index([market, status, price])
}

model Trade {
  id           String   @id @default(uuid(7))
  market       Market
  price        Decimal  @db.Decimal(18, 8)
  quantity     Decimal  @db.Decimal(18, 8)
  makerOrderId String
  takerOrderId String
  makerOrder   Order    @relation("MakerOrder", fields: [makerOrderId], references: [id])
  takerOrder   Order    @relation("TakerOrder", fields: [takerOrderId], references: [id])
  createdAt    DateTime @default(now())
}
```
No new index on `Trade` - nothing in this feature's access patterns queries it yet (planning §4). A trade-history feature adds its own index when it exists.

## Edge Cases

- Incoming order exactly exhausts resting liquidity at a price level → maker goes `FILLED`, taker fully matched, no remainder
- Incoming order larger than all liquidity at the best price → walks to the next price level in the same pass, still price-time priority
- No crossing liquidity at all → rests exactly as Place Order behaved, `status: NEW`, `fills: []`
- **DB write fails after in-memory match already applied → 503 `database_unavailable`, but in-memory book is now ahead of durable state until process restart rebuilds it from Postgres** (infra failure mode - accepted risk, see planning decision 2, not fixed in this feature)
- Two near-simultaneous requests for the same market → serialized correctly by the single-threaded synchronous match sequence, no double-matching

## Non-Goals

Kafka/event emission, websocket fanout, trade history endpoint, order cancellation, fees/commission, horizontal scaling of the API process (single-instance assumption), market orders, authentication/ownership
