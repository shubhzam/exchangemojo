import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { config } from "./config.js";

// prisma 7 requires an explicit driver adapter. the adapter owns the pg
// connection pool, so pool tuning happens here, not in prisma options.
const adapter = new PrismaPg({ connectionString: config.databaseUrl });

export const prisma = new PrismaClient({ adapter });

// used by the health endpoint later. cheapest possible round trip that
// proves the socket is open and the server is answering.
export async function pingDb(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (err) {
    // during bring-up we need the real cause, not just false. the health
    // endpoint will still only expose the boolean.
    console.error("db ping failed:", err);
    return false;
  }
}