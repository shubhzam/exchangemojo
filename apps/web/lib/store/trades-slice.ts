import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { Market } from "@repo/shared";
import type { TradeEvent } from "@/lib/api/types";
import { TRADE_FEED_LIMIT } from "@/lib/config/markets";
import { marketStreamReset } from "./actions";

// there is no recent-trades endpoint, so the feed starts empty on load and
// only holds what arrived over the websocket since then
export type TradesState = { symbol: Market | null; items: TradeEvent[] };

const initialState: TradesState = { symbol: null, items: [] };

const tradesSlice = createSlice({
  name: "trades",
  initialState,
  reducers: {
    tradeReceived(state, action: PayloadAction<TradeEvent>) {
      const trade = action.payload;
      if (state.symbol !== trade.s) return;
      if (state.items.some((t) => t.t === trade.t)) return;
      state.items.unshift(trade);
      if (state.items.length > TRADE_FEED_LIMIT) state.items.length = TRADE_FEED_LIMIT;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(marketStreamReset, (_state, action) => ({ symbol: action.payload, items: [] }));
  },
});

export const { tradeReceived } = tradesSlice.actions;
export const tradesReducer = tradesSlice.reducer;
