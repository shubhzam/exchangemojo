import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { MARKETS, type Market } from "@repo/shared";
import { DEFAULT_MARKET } from "@/lib/config/markets";
import type { StoredAccount, StoredAccounts } from "@/lib/storage-keys";

// accounts and the selected market. persisted to localStorage by Providers,
// loaded after mount so server and client render the same first frame.
export type PrefsState = {
  hydrated: boolean;
  accounts: StoredAccount[];
  activeId: string | null;
  market: Market;
};

const initialState: PrefsState = { hydrated: false, accounts: [], activeId: null, market: DEFAULT_MARKET };

const prefsSlice = createSlice({
  name: "prefs",
  initialState,
  reducers: {
    prefsHydrated(state, action: PayloadAction<{ stored: StoredAccounts; market: string | null }>) {
      const { stored, market } = action.payload;
      state.accounts = stored.accounts;
      state.activeId =
        stored.activeId && stored.accounts.some((a) => a.id === stored.activeId)
          ? stored.activeId
          : (stored.accounts[0]?.id ?? null);
      if (market && (MARKETS as readonly string[]).includes(market)) state.market = market as Market;
      state.hydrated = true;
    },
    accountAdded(state, action: PayloadAction<StoredAccount>) {
      const existing = state.accounts.find((a) => a.id === action.payload.id);
      if (existing) existing.label = action.payload.label;
      else state.accounts.push(action.payload);
      state.activeId = action.payload.id;
    },
    accountSelected(state, action: PayloadAction<string>) {
      if (state.accounts.some((a) => a.id === action.payload)) state.activeId = action.payload;
    },
    accountRemoved(state, action: PayloadAction<string>) {
      state.accounts = state.accounts.filter((a) => a.id !== action.payload);
      if (state.activeId === action.payload) state.activeId = state.accounts[0]?.id ?? null;
    },
    marketSelected(state, action: PayloadAction<Market>) {
      state.market = action.payload;
    },
  },
});

export const { prefsHydrated, accountAdded, accountSelected, accountRemoved, marketSelected } = prefsSlice.actions;
export const prefsReducer = prefsSlice.reducer;

export function parseStoredAccounts(raw: string | null): StoredAccounts {
  const empty: StoredAccounts = { accounts: [], activeId: null };
  if (!raw) return empty;
  try {
    const value = JSON.parse(raw) as Partial<StoredAccounts>;
    const accounts = Array.isArray(value.accounts)
      ? value.accounts.filter(
          (a): a is StoredAccount =>
            typeof a === "object" && a !== null && typeof a.id === "string" && typeof a.label === "string",
        )
      : [];
    return { accounts, activeId: typeof value.activeId === "string" ? value.activeId : null };
  } catch {
    return empty;
  }
}
