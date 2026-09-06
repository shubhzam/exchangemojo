import express from "express";
import { config } from "./lib/config.js";

const app = express();

app.use(express.json());

// bare liveness check - proves the process is up and routing works.
// this is NOT the /health endpoint from the scaffolding plan; that one
// checks postgres and redis and lands after both are wired.
app.get("/ping", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(config.port, () => {
  console.log(`api listening on http://localhost:${config.port}`);
});