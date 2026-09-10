-- CreateEnum
CREATE TYPE "Market" AS ENUM ('SOL_USDC', 'ETH_USDC', 'BTC_USDC');

-- CreateEnum
CREATE TYPE "OrderSide" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('OPEN');

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "market" "Market" NOT NULL,
    "side" "OrderSide" NOT NULL,
    "price" DECIMAL(18,8) NOT NULL,
    "quantity" DECIMAL(18,8) NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Order_market_status_price_idx" ON "Order"("market", "status", "price");
