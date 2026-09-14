import { Decimal } from "decimal.js";
import type { Prisma } from "../generated/prisma/client.js";
import type { Asset, OrderSide } from "../generated/prisma/client.js";
import type { Market } from "@repo/shared";

// which asset a market's quote/base sides correspond to. quote is always
// usdc in this project's 3 markets; base is the market's own asset.
const BASE_ASSET: Record<Market, Asset> = {
  SOLUSDC: "SOL",
  ETHUSDC: "ETH",
  BTCUSDC: "BTC",
};
const QUOTE_ASSET: Asset = "USDC";

export class InsufficientFundsError extends Error {
  constructor(
    readonly asset: Asset,
    readonly required: string,
    readonly available: string
  ) {
    super(`insufficient ${asset}: need ${required}, have ${available}`);
    this.name = "InsufficientFundsError";
  }
}

// determines which asset and how much a new order needs reserved.
// buy reserves quote (price x quantity) - the worst-case cost.
// sell reserves base (quantity alone) - price-independent, giving up
// units of the asset itself regardless of what it sells for.
export function reservationFor(
  market: Market,
  side: OrderSide,
  price: Decimal,
  quantity: Decimal
): { asset: Asset; amount: Decimal } {
  if (side === "BUY") {
    return { asset: QUOTE_ASSET, amount: price.times(quantity) };
  }
  return { asset: BASE_ASSET[market], amount: quantity };
}

// atomic conditional update - correctness comes from postgres's row lock,
// not from anything in this code. must run and be awaited BEFORE the
// order book's synchronous match block starts (planning decision 4) -
// this function's await can never sit inside that block.
export async function reserveFunds(
  tx: Prisma.TransactionClient,
  accountId: string,
  asset: Asset,
  amount: Decimal
): Promise<void> {
  const result = await tx.$executeRaw`
    UPDATE "Balance"
    SET free = free - ${amount.toString()}::numeric,
        locked = locked + ${amount.toString()}::numeric
    WHERE "accountId" = ${accountId} AND asset = ${asset}::"Asset" AND free >= ${amount.toString()}::numeric
  `;

  if (result === 0) {
    const balance = await tx.balance.findUnique({
      where: { accountId_asset: { accountId, asset } },
    });
    throw new InsufficientFundsError(
      asset,
      amount.toFixed(8),
      balance ? balance.free.toFixed(8) : "0.00000000"
    );
  }
}

// releases a canceled order's remaining locked amount back to free.
// computed from the order's own stored fields - no separate ledger to consult.
export async function releaseFunds(
  tx: Prisma.TransactionClient,
  accountId: string,
  asset: Asset,
  amount: Decimal
): Promise<void> {
  await tx.balance.update({
    where: { accountId_asset: { accountId, asset } },
    data: {
      free: { increment: amount.toString() },
      locked: { decrement: amount.toString() },
    },
  });
}

// settles one fill for one side of the trade. maker always trades at
// exactly its own price - never refunds. only a buy taker executing
// better than its own limit ever refunds (planning decision 5).
export async function settleFill(
  tx: Prisma.TransactionClient,
  params: {
    accountId: string;
    market: Market;
    side: OrderSide;
    fillPrice: Decimal;
    fillQuantity: Decimal;
    isTaker: boolean;
    takerLimitPrice: Decimal | null; // only meaningful when isTaker && side === "BUY"
  }
): Promise<void> {
  const { accountId, market, side, fillPrice, fillQuantity, isTaker, takerLimitPrice } = params;
  const base = BASE_ASSET[market];

  if (side === "BUY") {
    // release locked usdc at whatever price was originally reserved for
    // this quantity - the maker's own price if maker, the taker's limit
    // if taker (never the execution price, which is what was ACTUALLY owed)
    const releasePrice = isTaker && takerLimitPrice ? takerLimitPrice : fillPrice;
    const lockedToRelease = releasePrice.times(fillQuantity);
    const actuallyOwed = fillPrice.times(fillQuantity);
    const refund = lockedToRelease.minus(actuallyOwed);

    await tx.balance.update({
      where: { accountId_asset: { accountId, asset: QUOTE_ASSET } },
      data: {
        locked: { decrement: lockedToRelease.toString() },
        // refund is zero for a maker (releasePrice === fillPrice always),
        // and zero for a taker matching exactly at its own limit
        free: refund.greaterThan(0) ? { increment: refund.toString() } : undefined,
      },
    });

    await tx.balance.update({
      where: { accountId_asset: { accountId, asset: base } },
      data: { free: { increment: fillQuantity.toString() } },
    });
  } else {
    // sell: locked base asset released is exact, always - no price
    // dependency, so no refund branch exists on this side at all
    await tx.balance.update({
      where: { accountId_asset: { accountId, asset: base } },
      data: { locked: { decrement: fillQuantity.toString() } },
    });

    await tx.balance.update({
      where: { accountId_asset: { accountId, asset: QUOTE_ASSET } },
      data: { free: { increment: fillPrice.times(fillQuantity).toString() } },
    });
  }
}