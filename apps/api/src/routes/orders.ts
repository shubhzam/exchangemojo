import { Router } from "express";
import { createOrderSchema, marketSchema } from "@repo/shared";
import { createOrder, getOrderBook } from "../services/order-service.js";

export const ordersRouter: Router = Router();

ordersRouter.post("/api/v3/order", async (req, res) => {
  const input = createOrderSchema.parse(req.body);
  const order = await createOrder(input);
  res.status(201).json(order);
});

ordersRouter.get("/api/v3/depth", async (req, res) => {
  const symbol = marketSchema.parse(req.query.symbol);
  const book = await getOrderBook(symbol);
  res.status(200).json(book);
});