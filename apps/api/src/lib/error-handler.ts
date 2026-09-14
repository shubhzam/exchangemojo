import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { Prisma } from "../generated/prisma/client.js";
import { OrderNotFoundError } from "../services/order-service.js";

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

  if (err instanceof OrderNotFoundError) {
    res.status(404).json({ error: "order_not_found" });
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