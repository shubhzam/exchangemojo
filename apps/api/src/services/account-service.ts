import { prisma } from "../lib/db.js";
import type { Asset } from "../generated/prisma/client.js";

const ALL_ASSETS: Asset[] = ["USDC", "SOL", "ETH", "BTC"];

export type BalanceResponse = {
  asset: Asset;
  free: string;
  locked: string;
};

export type AccountResponse = {
  accountId: string;
  balances: BalanceResponse[];
};

export async function createAccount(
  startingBalances: Partial<Record<Asset, string>>
): Promise<AccountResponse> {
  const account = await prisma.account.create({
    data: {
      balances: {
        create: ALL_ASSETS.map((asset) => ({
          asset,
          free: startingBalances[asset] ?? "0",
        })),
      },
    },
    include: { balances: true },
  });

  return {
    accountId: account.id,
    balances: account.balances.map((b) => ({
      asset: b.asset,
      free: b.free.toFixed(8),
      locked: b.locked.toFixed(8),
    })),
  };
}

export class AccountNotFoundError extends Error {
  constructor(accountId: string) {
    super(`account not found: ${accountId}`);
    this.name = "AccountNotFoundError";
  }
}

export async function getAccount(accountId: string): Promise<AccountResponse> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: { balances: true },
  });

  if (!account) {
    throw new AccountNotFoundError(accountId);
  }

  return {
    accountId: account.id,
    balances: account.balances.map((b) => ({
      asset: b.asset,
      free: b.free.toFixed(8),
      locked: b.locked.toFixed(8),
    })),
  };
}