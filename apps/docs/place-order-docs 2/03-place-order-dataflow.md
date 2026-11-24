# Place Order - Dataflow

## Sample Payload

`POST /api/v3/order`
```json
{ "symbol": "SOLUSDC", "side": "BUY", "price": "184.50", "quantity": "2.5" }
```

## Success Trace

1. Client → `POST /api/v3/order`, body above.
2. API handler → passes body to `createOrderSchema.parse()` (Zod, in `packages/shared`) - validates symbol is one of the 3 enum values, price/quantity are positive decimal strings.
3. Parsed result → `orderService.createOrder()` → `input.symbol` passed straight through as `prisma.order.create({ data: { market: input.symbol, ... } })` - no translation, wire value and Prisma enum value are the same string.
4. Prisma → `INSERT INTO "Order" (id, market, side, price, quantity, status, "createdAt") VALUES (uuid7(), 'SOLUSDC', 'BUY', 184.50000000, 2.50000000, 'NEW', now())`.
5. Response → 201, `createdAt` converted to epoch milliseconds as `transactTime`, `id` renamed `orderId`, `market` renamed `symbol` - the only shaping this layer still does.

## Failure Trace

1. Client → `POST /api/v3/order` with `{ "symbol": "DOGEUSDC", ... }`.
2. API handler → `createOrderSchema.parse()` throws - `DOGEUSDC` isn't in the 3-value enum.
3. No database call happens.
4. Response → 400, `{ "error": "invalid_input", "details": [ { "path": ["symbol"], "message": "Invalid enum value" } ] }`.

No sequence diagram - linear flow with a single validation branch, under the 3-hop threshold that would warrant one.
