# Cancel Order - Dataflow

## Sample Payload

Resting (from a prior placement): `BUY SOLUSDC @ 184.50, origQty 2.5, remainingQuantity 2.5, status NEW`.

`DELETE /api/v3/order?symbol=SOLUSDC&orderId=<that order's id>`

## Success Trace

1. Client → `DELETE /api/v3/order`, `symbol` and `orderId` as query params.
2. Zod validates the shape - `symbol` is one of the 3 markets, `orderId` is present.
3. Matching engine (synchronous) → `book.cancelOrder(orderId)` → looks up the id index → found → removes it from its price level (and the level itself if now empty) → removes it from the id index → returns the removed `BookOrder`.
4. Single Prisma update: `status → CANCELED`. `remainingQuantity` and `executedQty`-implying fields untouched - nothing else about the row changes.
5. Response → 200, `{ symbol: "SOLUSDC", orderId, price: "184.50000000", origQty: "2.50000000", executedQty: "0.00000000", status: "CANCELED" }`.

## Failure Trace

1. Client → `DELETE /api/v3/order?symbol=SOLUSDC&orderId=<an order that already fully matched earlier>`.
2. `book.cancelOrder(orderId)` → id index lookup finds nothing - `match()` already removed this order from both the price level and the id index when it filled.
3. No database call happens at all - the not-found is resolved entirely in memory.
4. Response → 404, `{ "error": "order_not_found" }`.

Same shape of failure trace as Order Matching's validation-error case - a check that short-circuits before touching Postgres, not a query that comes back empty. No sequence diagram - linear, one branch (found or not), under the threshold that would need one.
