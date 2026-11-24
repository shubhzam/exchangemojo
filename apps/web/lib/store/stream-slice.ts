import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { Market } from "@repo/shared";
import { marketStreamReset } from "./actions";

export type SocketStatus = "connecting" | "open" | "reconnecting";
export type StreamName = "depth" | "trade";
export type ConnectionStatus = "connecting" | "live" | "reconnecting";

export type StreamState = { symbol: Market | null; depth: SocketStatus; trade: SocketStatus };

const initialState: StreamState = { symbol: null, depth: "connecting", trade: "connecting" };

const streamSlice = createSlice({
  name: "stream",
  initialState,
  reducers: {
    socketStatusChanged(
      state,
      action: PayloadAction<{ symbol: Market; stream: StreamName; status: SocketStatus }>,
    ) {
      if (state.symbol !== action.payload.symbol) return;
      state[action.payload.stream] = action.payload.status;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(marketStreamReset, (_state, action) => ({ ...initialState, symbol: action.payload }));
  },
});

export const { socketStatusChanged } = streamSlice.actions;
export const streamReducer = streamSlice.reducer;

export function selectConnectionStatus(state: { stream: StreamState }): ConnectionStatus {
  const { depth, trade } = state.stream;
  if (depth === "open" && trade === "open") return "live";
  if (depth === "reconnecting" || trade === "reconnecting") return "reconnecting";
  return "connecting";
}
