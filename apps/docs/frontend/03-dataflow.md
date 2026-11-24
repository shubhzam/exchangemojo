# Frontend - Dataflow

## Success: crossing order

Account A has a resting BUY 2.00 SOLUSDC @ 150.00. Account B (second tab) sells 1.00 @ 150.00.

1. B's form builds `{symbol:"SOLUSDC", side:"SELL", price:"150.00", quantity:"1.00"}`. `createOrderSchema.safeParse` passes; the precision check passes.
2. `POST /api/v3/order` with `X-Account-Id: B`. The API reserves 1 SOL, matches, and commits.
3. Kafka publishes a trade (`p:"150.00000000"`, `q:"1.00000000"`, `m:true`) and a depth update (`b:[["150.00000000","1.00000000"]]`).
4. The response is 201 `FILLED` with one fill. RTK invalidates `Account` and `OpenOrders`, so both refetch.
5. Both tabs receive the depth event: the 150.00 bid level drops from 2.00 to 1.00. Cumulative bars are recomputed with `Decimal`.
6. Both tabs receive the trade event. `m:true` means the buyer was the maker, so the row is red. It is prepended and the feed is trimmed to 50.
7. B's balances and open orders update from step 4's refetch. A's update on the next 3s poll, since there is no user stream.

## Failure: insufficient funds

Account C has 0 USDC and submits BUY 10.00 @ 150.00.

1. Client validation passes; the shared schema does not check balances.
2. `POST /api/v3/order`. `reserveFunds` updates zero rows, so the API throws `InsufficientFundsError`.
3. Response, 400: `{"error":"insufficient_funds","asset":"USDC","required":"1500.00000000","available":"0.00000000"}`.
4. The client wraps this in `ApiError`. The form shows "Insufficient USDC: need 1500.00, have 0.00" under the submit button. Entered values are kept.
5. Nothing was matched or published, so the book and trade feed do not change.
