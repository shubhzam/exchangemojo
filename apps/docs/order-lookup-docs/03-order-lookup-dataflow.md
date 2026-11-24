# Order Lookup - Dataflow

## Sample Payload

`GET /api/v3/openOrders?symbol=SOLUSDC`, header `X-Account-Id: <account>`.

## Trace

1. Client → request, header carries the account.
2. Zod validates `symbol` (optional) and the header shape.
3. `prisma.order.findMany({ where: { accountId, status: { in: ["NEW", "PARTIALLY_FILLED"] }, market: symbol } })` - single indexed query, no join, no matching-engine involvement.
4. Response → array of orders in the existing wire shape, minus `fills`.

No failure trace beyond the standard 400 (bad input) and empty-array cases already covered in the techspec's edge cases - nothing new to walk through hop-by-hop.
