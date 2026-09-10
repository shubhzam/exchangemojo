import { z } from "zod";
import { marketSchema } from "./market.js";

const decimalString = z
  .string()
  .regex(/^\d+(\.\d+)?$/, "must be a positive decimal")
  .refine((val) => Number(val) > 0, "must be greater than zero");

export const orderSideSchema = z.enum(["BUY", "SELL"]);

export const createOrderSchema = z.object({
  symbol: marketSchema,
  side: orderSideSchema,
  price: decimalString,
  quantity: decimalString,
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type OrderSide = z.infer<typeof orderSideSchema>;