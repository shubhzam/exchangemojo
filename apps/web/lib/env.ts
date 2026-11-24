// NEXT_PUBLIC_* values are inlined at build time, so they must be read with
// these literal property accesses. set them before `next build`.
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");
export const WS_URL = (process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:4000").replace(/\/$/, "");
