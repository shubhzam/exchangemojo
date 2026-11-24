# Balances - Dataflow

## Sample Payload

Account M (maker) holds `free: 1000 USDC`. Account T (taker) holds `free: 1000 USDC`.

**M rests:** `POST /api/v3/order`, header `X-Account-Id: M`, `{ "symbol": "SOLUSDC", "side": "BUY", "price": "184.50", "quantity": "2.0" }`

**Reservation for M:** BUY, so `184.50 × 2.0 = 369` USDC. `Balance(M, USDC): free 1000→631, locked 0→369`. Order rests, `status: NEW`.

**T crosses:** `POST /api/v3/order`, header `X-Account-Id: T`, `{ "symbol": "SOLUSDC", "side": "SELL", "price": "184.00", "quantity": "1.0" }`

## Success Trace

1. Reservation for T (SELL, base-asset, price-independent): needs `1.0` SOL free - assume T already holds it, `Balance(T, SOL): free 1.0→0.0, locked 0.0→1.0`.
2. Synchronous match begins only now, after T's reservation succeeded. Crosses M at 184.50 (maker's price), fills `1.0`.
3. Settlement, maker (M, BUY, matched at exactly its own price - no refund case applies):
   `Balance(M, USDC): locked 369→184.50` (release `184.50 × 1.0`, the exact cost of this fill)
   `Balance(M, SOL): free 0→1.0`
4. Settlement, taker (T, SELL - price-independent reservation, no refund case applies either):
   `Balance(T, SOL): locked 1.0→0.0`
   `Balance(T, USDC): free 631→815.50` (received `184.50 × 1.0` at the actual execution price)
5. M's order: `remainingQuantity 2.0→1.0`, `status: PARTIALLY_FILLED`, still `184.50` locked in USDC for the unmatched remainder.
6. T's order: `status: FILLED`, nothing rests.

Neither side triggered the BUY-taker refund branch here - M is a maker (never refunds), T is a SELL taker (price-independent, never refunds). That branch needs a BUY taker matching *better* than its own limit specifically.

## Failure Trace

1. A third account, P, holds `free: 50 USDC`. Places `POST /api/v3/order`, `{ "symbol": "SOLUSDC", "side": "BUY", "price": "184.50", "quantity": "1.0" }` - needs `184.50` USDC.
2. Reservation attempt: `UPDATE "Balance" SET free = free - 184.50, locked = locked + 184.50 WHERE "accountId" = P AND asset = 'USDC' AND free >= 184.50` - affects zero rows, `P`'s `free` is only `50`.
3. Order rejected here - the matching engine is never called, the book is never touched, nothing optimistic has happened that needs unwinding.
4. Response → 400, `{ "error": "insufficient_funds", "asset": "USDC", "required": "184.50000000", "available": "50.00000000" }`.
