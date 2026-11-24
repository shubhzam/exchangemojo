# Order Matching - Dataflow

## Sample Payload

Resting (already on the book, from a prior request): `BUY SOLUSDC @ 184.50, qty 2.5, remainingQuantity 2.5, status NEW`.

Incoming: `POST /api/v3/order`
```json
{ "symbol": "SOLUSDC", "side": "SELL", "price": "184.00", "quantity": "1.0" }
```

## Success Trace

1. Client → `POST /api/v3/order`, body above.
2. Zod validates the shape (unchanged from Place Order).
3. Matching engine (synchronous, in-memory) → looks up `SOLUSDC`'s book → best bid is 184.50 → incoming sell at 184.00 crosses it (sell price ≤ best bid).
4. Match computed: `min(taker remaining 1.0, maker remaining 2.5) = 1.0`. Execution price = maker's price, `184.50` - not the taker's `184.00`. Maker's `remainingQuantity` → `1.5`, status → `PARTIALLY_FILLED`. Taker fully consumed, status → `FILLED`. In-memory book mutated to reflect both, synchronously, before any DB call.
5. Single Prisma transaction persists: update maker order, insert taker order, insert `Trade` (price 184.50, qty 1.0, makerOrderId, takerOrderId).
6. Response → 201, `{ orderId, symbol: "SOLUSDC", side: "SELL", price: "184.00000000", origQty: "1.00000000", executedQty: "1.00000000", status: "FILLED", fills: [{ price: "184.50000000", qty: "1.00000000", tradeId }] }`.

## Failure Trace

1. Same incoming order as above.
2. Steps 3-4 identical - match computed, **in-memory book already mutated**: maker shows 1.5 remaining, taker shows filled, entirely in process memory.
3. Step 5's transaction throws `ECONNREFUSED` - Postgres unreachable.
4. Response → 503, `{ "error": "database_unavailable" }`.
5. **The accepted risk (planning decision 2) is now live**: in-memory state says the match happened; Postgres still shows the maker at 2.5 remaining, untouched. If the process restarts before a retry succeeds, the book rebuilds from Postgres and the match is gone - the client received a 503, so this isn't silently wrong, but it's the exact scenario the decision log flagged rather than solved.

No sequence diagram - linear with one true branch (crosses or doesn't), under the threshold that would need one.
