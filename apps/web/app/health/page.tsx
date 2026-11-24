"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Brand } from "@/components/trade-view";
import { Panel, PanelHeader } from "@/components/ui";
import { API_URL } from "@/lib/env";

type HealthResponse = {
  status: "ok" | "degraded";
  checks: {
    postgres: "up" | "down";
    redis: "up" | "down";
  };
};

function Check({ name, value }: { name: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-t border-border px-3 py-2 text-sm">
      <span className="text-muted">{name}</span>
      <span className={value === "up" || value === "ok" ? "text-text" : "font-semibold text-accent"}>{value}</span>
    </div>
  );
}

export default function HealthPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // /health answers 503 with the same body when degraded, so read it either way
    fetch(`${API_URL}/health`, { cache: "no-store" })
      .then((res) => res.json() as Promise<HealthResponse>)
      .then(setHealth)
      .catch((err: unknown) => setError(String(err)));
  }, []);

  return (
    <div className="min-h-screen">
      <header className="flex h-14 items-center gap-6 border-b border-border bg-panel px-4">
        <Brand />
        <Link href="/trade" className="ml-auto text-sm">
          Back to trading
        </Link>
      </header>
      <main className="mx-auto max-w-md p-6">
        <Panel>
          <PanelHeader title="API health">
            <span className="text-xs text-muted num">{API_URL}</span>
          </PanelHeader>
          {error ? (
            <p role="alert" className="px-3 py-4 text-sm text-text">
              Failed to reach the API: <span className="text-accent">{error}</span>
            </p>
          ) : !health ? (
            <p className="px-3 py-4 text-sm text-muted">Checking...</p>
          ) : (
            <div data-testid="health">
              <Check name="status" value={health.status} />
              <Check name="postgres" value={health.checks.postgres} />
              <Check name="redis" value={health.checks.redis} />
            </div>
          )}
        </Panel>
      </main>
    </div>
  );
}
