import { createAction } from "@reduxjs/toolkit";
import type { Market } from "@repo/shared";

// dispatched when the market stream (re)starts for a symbol. book, trades and
// stream slices all drop whatever they held for the previous market.
export const marketStreamReset = createAction<Market>("market/streamReset");
