import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { Prisma } from "../generated/prisma/client.js";

// registered last, after every route - express 5 forwards rejected
// promises from async handlers here automatically, no try/catch
// needed in the routes themselves.
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof ZodError) {
    res.status(400).json({ error: "invalid_input", details: err.issues });
    return;
  }

  if (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "ECONNREFUSED"
  ) {
    res.status(503).json({ error: "database_unavailable" });
    return;
  }

  console.error("unhandled error:", err);
  res.status(500).json({ error: "internal_error" });
}