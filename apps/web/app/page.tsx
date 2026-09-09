"use client";

import { useEffect, useState } from "react";

type HealthResponse = {
  status: "ok" | "degraded";
  checks: {
    postgres: "up" | "down";
    redis: "up" | "down";
  };
};

export default function Home() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("http://localhost:4000/health")
      .then((res) => res.json())
      .then(setHealth)
      .catch((err) => setError(String(err)));
  }, []);

  if (error) {
    return <main>failed to reach api: {error}</main>;
  }

  if (!health) {
    return <main>checking...</main>;
  }

  return (
    <main>
      <h1>crypto-exchange</h1>
      <p>status: {health.status}</p>
      <p>postgres: {health.checks.postgres}</p>
      <p>redis: {health.checks.redis}</p>
    </main>
  );
}