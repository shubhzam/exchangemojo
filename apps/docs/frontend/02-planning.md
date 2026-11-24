# Frontend - Planning

## Order of work

1. **Foundation.** Env vars, typed client, RTK Query store, account switcher, market selector, `/health` and `/trade`, black and orange theme tokens. CORS needs no change.
2. **Live market data.** Book and trades slices, `useMarketStream`, order book and trade feed.
3. **Trading.** Order form, open orders with cancel, inline API errors, invalidation and polling.
4. **Balances.** Free and locked per asset.
5. **Docs assets.** Excalidraw architecture and order-status diagrams with 2x PNGs, a Playwright screenshot script that seeds an empty market, and a root README embedding both.

Each stage ends with a browser check.

## Decisions

- **Book state in Redux, snapshot via RTK Query**, written into the slice as one source of truth.
- **Aggregate snapshots by price.** The API returns per-order rows.
- **Buffer then replay** events that arrive before the snapshot. Level totals make replay idempotent; the 30s refetch fixes any stale level.
- **Account-scoped cache keys**, so switching accounts never shows another account's data.
- **Starting balances through the existing `balances` field.** No new endpoint.
- **Screenshots seed through the real API** on a market whose book is empty, and stop if none is.

## Risks

- **Ports.** 3000 and 4000 are held by `web-hooks-*` containers, and the exchange's Postgres and Redis are stopped. Browser checks need these freed.
- **`@repo/shared` must be built first.** `turbo dev` does not build dependencies.
- **Precision config:** SOL 2 / 3, ETH 2 / 4, BTC 2 / 5 (price / qty decimals), in one file.
- **No ownership check on cancel.** The UI offers cancel only on the active account's orders.
- **`apps/docs` is git-ignored** at the root, so diagrams and screenshots will not reach GitHub until that changes.

## Out of scope

Charts, auth, funding endpoint, API changes, docker and infra files.

## Definition of done

Two accounts cross orders on SOLUSDC. Book, trades, open orders and balances update without refresh. Cancel removes the level. Market switching leaves no stale levels.
