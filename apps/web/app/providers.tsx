"use client";

import { useEffect, useState } from "react";
import { Provider } from "react-redux";
import { makeStore } from "@/lib/store/store";
import { parseStoredAccounts, prefsHydrated } from "@/lib/store/prefs-slice";
import { ACCOUNTS_STORAGE_KEY, MARKET_STORAGE_KEY } from "@/lib/storage-keys";

export function Providers({ children }: { children: React.ReactNode }) {
  const [store] = useState(makeStore);

  useEffect(() => {
    // localStorage is read after mount so the server render and the first
    // client render match
    store.dispatch(
      prefsHydrated({
        stored: parseStoredAccounts(window.localStorage.getItem(ACCOUNTS_STORAGE_KEY)),
        market: window.localStorage.getItem(MARKET_STORAGE_KEY),
      }),
    );

    let lastAccounts = "";
    let lastMarket = "";
    return store.subscribe(() => {
      const { prefs } = store.getState();
      if (!prefs.hydrated) return;
      const accounts = JSON.stringify({ accounts: prefs.accounts, activeId: prefs.activeId });
      if (accounts !== lastAccounts) {
        window.localStorage.setItem(ACCOUNTS_STORAGE_KEY, accounts);
        lastAccounts = accounts;
      }
      if (prefs.market !== lastMarket) {
        window.localStorage.setItem(MARKET_STORAGE_KEY, prefs.market);
        lastMarket = prefs.market;
      }
    });
  }, [store]);

  return <Provider store={store}>{children}</Provider>;
}
