import { Redis } from "ioredis";
import { config } from "./config.js";

export const redis = new Redis(config.redisUrl);

export async function pingRedis(): Promise<boolean> {
  try {
    const reply = await redis.ping();
    return reply === "PONG";
  } catch (err) {
    console.error("redis ping failed:", err);
    return false;
  }
}