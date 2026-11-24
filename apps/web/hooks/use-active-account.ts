"use client";

import { useAppSelector } from "@/lib/store/store";
import type { StoredAccount } from "@/lib/storage-keys";

export function useActiveAccount(): StoredAccount | null {
  return useAppSelector((s) => s.prefs.accounts.find((a) => a.id === s.prefs.activeId) ?? null);
}
