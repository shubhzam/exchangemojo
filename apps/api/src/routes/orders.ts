import { Router } from "express";
import { z } from "zod";
import { createOrderSchema, marketSchema } from "@repo/shared";
import { createOrder, getDepth, cancelOrder } from "../services/order-service.js";
import { requireAccountHeader } from "../lib/account-context.js";

export const ordersRouter: Router = Router();

ordersRouter.post("/api/v3/order", requireAccountHeader, async (req, res) => {
  const input = createOrderSchema.parse(req.body);
  const order = await createOrder(req.accountId, input);
  res.status(201).json(order);
});

ordersRouter.get("/api/v3/depth", async (req, res) => {
  const symbol = marketSchema.parse(req.query.symbol);
  const book = await getDepth(symbol);
  res.status(200).json(book);
});

ordersRouter.delete("/api/v3/order", requireAccountHeader, async (req, res) => {
  const symbol = marketSchema.parse(req.query.symbol);
  const orderId = z.string().min(1, "orderId is required").parse(req.query.orderId);
  const result = await cancelOrder(symbol, orderId);
  res.status(200).json(result);
});