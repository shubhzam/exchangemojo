# Cancel Order - Techspec

**Version targets:** zod 4.5.4, prisma 7.10.0, express 5.2.1 (unchanged)

## Problem Statement

Remove a resting order from the book before it fully matches. Cancels only unmatched remaining quantity on a partial fill. No new entity, no new execution - extends `Order`'s lifecycle and `OrderBook`'s internal structure only.

## Requirements

Functional:
- Cancel a `NEW` or `PARTIALLY_FILLED` order by `orderId`, removing it from the in-memory book and marking it `CANCELED` in Postgres
- Already-terminal or nonexistent orders return 404, not an error or silent no-op

Non-functional:
- Lookup-and-removal from the book must be synchronous, no `await` in between - same requirement as `match()`, not a separate rule
- `OrderBook`'s fill-removal path (inside `match()`) must stay in sync with its new id index - an order removed there has to disappear from both structures atomically

## API Contract

**DELETE /api/v3/order?symbol=SOLUSDC&orderId=...**

Response 200:
```json
{
  "symbol": "SOLUSDC",
  "orderId": "...",
  "price": "184.50000000",
  "origQty": "2.50000000",
  "executedQty": "1.00000000",
  "status": "CANCELED"
}
```
`executedQty` reflects whatever matched before the cancel - unchanged by this operation, just carried through.

Response 400 (invalid symbol or missing orderId):
```json
{ "error": "invalid_input", "details": [...] }
```

Response 404 (already filled, already canceled, or unknown id):
```json
{ "error": "order_not_found" }
```

## Schema

```prisma
enum OrderStatus {
  NEW
  PARTIALLY_FILLED
  FILLED
  CANCELED
}
```
Enum value addition only - no column changes, no backfill needed (unlike `remainingQuantity` in Order Matching, adding an enum value doesn't touch existing rows).

## Edge Cases

- Cancel a `NEW` order with nothing matched yet → removed entirely from book, `status: CANCELED`, `executedQty: "0.00000000"`
- Cancel a `PARTIALLY_FILLED` order → remaining portion removed from book, `executedQty` shows what already filled, `remainingQuantity` left as-is (not zeroed) at time of cancel
- Cancel an already-`FILLED` order → not in the id index (removed by `match()` when it filled) → 404, no DB call
- Cancel an already-`CANCELED` order → not in the id index (removed by the first cancel) → same 404
- Cancel racing a concurrent match for the same order → resolved deterministically by the single-threaded synchronous mechanism (planning §5) - whichever's block runs first wins, the other finds nothing
- **Postgres unreachable after in-memory removal already applied → 503 `database_unavailable`, same accepted-risk shape as Order Matching's failure mode** (infra failure mode - not solved here, inherited as-is)

## Non-Goals

Canceling by `clientOrderId` (no client-order-id concept in this system), bulk/cancel-all, order modification (cancel-replace), authentication/ownership checks on who can cancel what
