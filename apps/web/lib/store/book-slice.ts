import { createSelector, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { Market } from "@repo/shared";
import type { DepthEvent, DepthResponse, PriceLevel } from "@/lib/api/types";
import { BOOK_LEVELS_PER_SIDE } from "@/lib/config/markets";
import { Decimal, levelKey } from "@/lib/decimal";
import { marketStreamReset } from "./actions";

// price -> total quantity at that level, both as 8-decimal strings
type Levels = Record<string, string>;

export type BookState = {
  symbol: Market | null;
  bids: Levels;
  asks: Levels;
  // true once a snapshot has been applied for this symbol
  ready: boolean;
  // non-null while a snapshot request is in flight: depth events are held
  // here and replayed on top of the snapshot when it lands
  buffer: DepthEvent[] | null;
};

const initialState: BookState = { symbol: null, bids: {}, asks: {}, ready: false, buffer: null };

// depth events carry the new total at a level; zero removes it
function applyLevels(side: Levels, levels: PriceLevel[]) {
  for (const [price, qty] of levels) {
    const key = levelKey(price);
    const total = new Decimal(qty);
    if (total.isZero()) delete side[key];
    else side[key] = total.toFixed(8);
  }
}

function applyEvent(state: BookState, event: DepthEvent) {
  applyLevels(state.bids, event.b);
  applyLevels(state.asks, event.a);
}

// the snapshot endpoint returns one row per order, so sum rows per price
function aggregate(rows: PriceLevel[]): Levels {
  const sums = new Map<string, Decimal>();
  for (const [price, qty] of rows) {
    const key = levelKey(price);
    sums.set(key, (sums.get(key) ?? new Decimal(0)).plus(qty));
  }
  const out: Levels = {};
  for (const [key, sum] of sums) {
    if (!sum.isZero()) out[key] = sum.toFixed(8);
  }
  return out;
}

function replayBuffer(state: BookState) {
  for (const event of state.buffer ?? []) applyEvent(state, event);
  state.buffer = null;
}

const bookSlice = createSlice({
  name: "book",
  initialState,
  reducers: {
    snapshotRequested(state, action: PayloadAction<Market>) {
      if (state.symbol !== action.payload) return;
      if (state.buffer === null) state.buffer = [];
    },
    snapshotReceived(state, action: PayloadAction<DepthResponse>) {
      if (state.symbol !== action.payload.symbol) return;
      state.bids = aggregate(action.payload.bids);
      state.asks = aggregate(action.payload.asks);
      replayBuffer(state);
      state.ready = true;
    },
    snapshotFailed(state, action: PayloadAction<Market>) {
      if (state.symbol !== action.payload) return;
      replayBuffer(state);
    },
    depthEventReceived(state, action: PayloadAction<DepthEvent>) {
      if (state.symbol !== action.payload.s) return;
      if (state.buffer !== null) state.buffer.push(action.payload);
      else applyEvent(state, action.payload);
    },
  },
  extraReducers: (builder) => {
    builder.addCase(marketStreamReset, (_state, action) => ({ ...initialState, symbol: action.payload }));
  },
});

export const { snapshotRequested, snapshotReceived, snapshotFailed, depthEventReceived } = bookSlice.actions;
export const bookReducer = bookSlice.reducer;

export type BookRow = {
  price: string;
  qty: string;
  cumulative: string;
  // width of the cumulative size bar, 0-100
  depthPercent: string;
};

export type BookView = {
  // highest price first, so the best ask sits just above the spread row
  asks: BookRow[];
  // highest price first, best bid just below the spread row
  bids: BookRow[];
  bestBid: string | null;
  bestAsk: string | null;
  spread: string | null;
};

function topLevels(levels: Levels, direction: "asc" | "desc"): [string, string][] {
  const sorted = Object.entries(levels).sort(([a], [b]) => {
    const cmp = new Decimal(a).comparedTo(b);
    return direction === "asc" ? cmp : -cmp;
  });
  return sorted.slice(0, BOOK_LEVELS_PER_SIDE);
}

function withCumulative(levels: [string, string][]): { price: string; qty: string; cumulative: Decimal }[] {
  let running = new Decimal(0);
  return levels.map(([price, qty]) => {
    running = running.plus(qty);
    return { price, qty, cumulative: running };
  });
}

export const selectBookView = createSelector(
  [(state: { book: BookState }) => state.book.bids, (state: { book: BookState }) => state.book.asks],
  (bids, asks): BookView => {
    // asks ascending and bids descending, cumulative from the best price outward
    const askRows = withCumulative(topLevels(asks, "asc"));
    const bidRows = withCumulative(topLevels(bids, "desc"));
    const maxCumulative = Decimal.max(
      askRows.at(-1)?.cumulative ?? 0,
      bidRows.at(-1)?.cumulative ?? 0,
    );

    const toRow = (r: { price: string; qty: string; cumulative: Decimal }): BookRow => ({
      price: r.price,
      qty: r.qty,
      cumulative: r.cumulative.toFixed(8),
      depthPercent: maxCumulative.isZero() ? "0" : r.cumulative.div(maxCumulative).times(100).toFixed(2),
    });

    const bestAsk = askRows[0]?.price ?? null;
    const bestBid = bidRows[0]?.price ?? null;
    return {
      asks: askRows.map(toRow).reverse(),
      bids: bidRows.map(toRow),
      bestAsk,
      bestBid,
      spread: bestAsk && bestBid ? new Decimal(bestAsk).minus(bestBid).toFixed(8) : null,
    };
  },
);
