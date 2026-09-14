import { Router } from "express";
import { z } from "zod";
import { createAccount, getAccount } from "../services/account-service.js";
import { requireAccountHeader } from "../lib/account-context.js";

export const accountsRouter: Router = Router();

const createAccountSchema = z.object({
  balances: z
    .object({
      USDC: z.string().optional(),
      SOL: z.string().optional(),
      ETH: z.string().optional(),
      BTC: z.string().optional(),
    })
    .optional(),
});

accountsRouter.post("/api/v1/accounts", async (req, res) => {
  const input = createAccountSchema.parse(req.body);
  const account = await createAccount(input.balances ?? {});
  res.status(201).json(account);
});

accountsRouter.get("/api/v3/account", requireAccountHeader, async (req, res) => {
  const account = await getAccount(req.accountId);
  res.status(200).json(account);
});