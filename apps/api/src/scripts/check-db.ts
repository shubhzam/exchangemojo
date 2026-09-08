import { pingDb, prisma } from "../lib/db.js";

// standalone connectivity probe. keep it around - when the health endpoint
// starts failing later, this isolates whether the problem is the db hop
// or everything above it.
const ok = await pingDb();
console.log(ok ? "postgres: reachable" : "postgres: unreachable");
await prisma.$disconnect();
process.exit(ok ? 0 : 1);