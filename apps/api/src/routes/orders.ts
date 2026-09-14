import { Router } from "express";
import { z } from "zod";
import { createOrderSchema, marketSchema } from "@repo/shared";
import { createOrder, getDepth, cancelOrder } from "../services/order-service.js";

export const ordersRouter: Router = Router();

ordersRouter.post("/api/v3/order", async (req, res) => {
  const input = createOrderSchema.parse(req.body);
  const order = await createOrder(input);
  res.status(201).json(order);
});

ordersRouter.get("/api/v3/depth", async (req, res) => {
  const symbol = marketSchema.parse(req.query.symbol);
  const book = await getDepth(symbol);
  res.status(200).json(book);
});

ordersRouter.delete("/api/v3/order", async (req, res) => {
  const symbol = marketSchema.parse(req.query.symbol);
  const orderId = z.string().min(1, "orderId is required").parse(req.query.orderId);
  const result = await cancelOrder(symbol, orderId);
  res.status(200).json(result);
});