# Realtime Streaming - Dataflow

## Sample Payload

Resting: `BUY SOLUSDC @ 184.50, remainingQuantity 2.0` (orderId `M`, account maker). Incoming: `POST /api/v3/order`, `{ "symbol": "SOLUSDC", "side": "SELL", "price": "184.00", "quantity": "1.0" }` (orderId `T`, account taker).

Two clients connected: one to `SOLUSDC@trade`, one to `SOLUSDC@depth`. A third client connected to `ETHUSDC@depth` for contrast.

## Success Trace

1. Match computes as before - fills 1.0 @ 184.50 (maker's price), maker's `remainingQuantity` → 1.0, taker fully filled.
2. `prisma.$transaction` persists the order/trade updates, same as every prior feature - unchanged by this one.
3. Transaction resolves successfully. Only now does publishing start.
4. `getLevelQuantity("BUY", 184.50)` queried against the now-updated in-memory book → returns `1.0` (the maker's new remaining amount, this being the only order left at that level).
5. Publish to `depth-events`, partition key `SOLUSDC`:
   ```json
   { "e": "depthUpdate", "E": <now>, "s": "SOLUSDC", "b": [["184.50000000", "1.00000000"]], "a": [] }
   ```
6. Publish to `trade-events`, partition key `SOLUSDC`:
   ```json
   { "e": "trade", "E": <now>, "s": "SOLUSDC", "t": "<tradeId>", "p": "184.50000000", "q": "1.00000000", "b": "M", "a": "T", "T": <trade.createdAt>, "m": true }
   ```
   `m: true` - the maker (`M`) is the BUY side, so the maker is the buyer.
7. Both messages land on the `SOLUSDC` partition of their respective topics, consumed by the gateway's single consumer.
8. Gateway looks up `SOLUSDC@depth` in the connection registry → writes the depth event to that one client. Looks up `SOLUSDC@trade` → writes the trade event to that one client.
9. The `ETHUSDC@depth` client receives nothing - different registry key, never touched by this publish.
10. HTTP response to the original `POST /api/v3/order` request already returned in step 2/3, before any of this - the client that placed the order gets its answer independent of whether the broadcast succeeds at all.

## Failure Trace

1. Same order placed, same match, same successful transaction commit.
2. Kafka broker happens to be down at publish time - both `producer.send()` calls reject.
3. Caught, logged. No retry in this feature's scope, no effect on the already-returned HTTP response.
4. Both connected websocket clients receive nothing for this fill - a real gap, but not a correctness bug. Either client can call `GET /api/v3/depth` or `GET /api/v3/order` at any time and get the true current state, same as before this feature existed.
