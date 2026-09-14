/*
  Warnings:

  - Added the required column `remainingQuantity` to the `Order` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OrderStatus" ADD VALUE 'PARTIALLY_FILLED';
ALTER TYPE "OrderStatus" ADD VALUE 'FILLED';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "remainingQuantity" DECIMAL(18,8) NOT NULL;

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "market" "Market" NOT NULL,
    "price" DECIMAL(18,8) NOT NULL,
    "quantity" DECIMAL(18,8) NOT NULL,
    "makerOrderId" TEXT NOT NULL,
    "takerOrderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_makerOrderId_fkey" FOREIGN KEY ("makerOrderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_takerOrderId_fkey" FOREIGN KEY ("takerOrderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
