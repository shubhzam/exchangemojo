import express from "express";
import cors from "cors";
import { config } from "./lib/config.js";
import { pingDb } from "./lib/db.js";
import { pingRedis } from "./lib/redis.js";

const app = express();

app.use(
  cors({
    origin: "http://localhost:3000",
  })
);

app.use(express.json());

// bare liveness check - proves the process is up and routing works.
app.get("/ping", (_req, res) => {
  res.json({ status: "ok" });
});

// readiness check - proves the full stack is wired, not just the process.
// 200 only when both backing services answer; 503 otherwise.
app.get("/health", async (_req, res) => {
  const [dbOk, redisOk] = await Promise.all([pingDb(), pingRedis()]);
  const healthy = dbOk && redisOk;

  res.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "degraded",
    checks: {
      postgres: dbOk ? "up" : "down",
      redis: redisOk ? "up" : "down",
    },
  });
});

app.listen(config.port, () => {
  console.log(`api listening on http://localhost:${config.port}`);
});