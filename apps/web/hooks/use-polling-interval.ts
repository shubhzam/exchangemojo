"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

// there is no user stream, so account data is polled. polling runs while the
// tab is visible (not only while focused, so two windows side by side both
// keep updating) and stops while it is hidden.
export function usePollingInterval(ms: number): number {
  const visible = useSyncExternalStore(
    subscribe,
    () => document.visibilityState === "visible",
    () => false,
  );
  return visible ? ms : 0;
}

export const ACCOUNT_POLL_MS = 3_000;
