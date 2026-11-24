"use client";

import { useAppSelector } from "@/lib/store/store";
import { selectConnectionStatus } from "@/lib/store/stream-slice";
import { cx } from "./ui";

const LABELS = { live: "Live", connecting: "Connecting", reconnecting: "Reconnecting" } as const;

export function ConnectionIndicator() {
  const status = useAppSelector(selectConnectionStatus);
  return (
    <div
      role="status"
      data-testid="connection-status"
      data-status={status}
      className="flex items-center gap-2 text-xs text-muted"
    >
      <span
        aria-hidden
        className={cx("size-2 rounded-full", status === "live" ? "bg-buy" : "animate-pulse bg-accent")}
      />
      {LABELS[status]}
    </div>
  );
}
