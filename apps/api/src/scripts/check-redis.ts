import { pingRedis, redis } from "../lib/redis.js";

const ok = await pingRedis();
console.log(ok ? "redis: reachable" : "redis: unreachable");
redis.disconnect();
process.exit(ok ? 0 : 1);