// localStorage keys. kept import-free so scripts/capture-screenshots.ts can
// share them.
export const ACCOUNTS_STORAGE_KEY = "cx.accounts.v1";
export const MARKET_STORAGE_KEY = "cx.market.v1";

export type StoredAccount = { label: string; id: string };
export type StoredAccounts = { accounts: StoredAccount[]; activeId: string | null };
