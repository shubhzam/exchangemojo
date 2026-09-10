/*
  Warnings:

  - The values [SOL_USDC,ETH_USDC,BTC_USDC] on the enum `Market` will be removed. If these variants are still used in the database, this will fail.
  - The values [OPEN] on the enum `OrderStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "Market_new" AS ENUM ('SOLUSDC', 'ETHUSDC', 'BTCUSDC');
ALTER TABLE "Order" ALTER COLUMN "market" TYPE "Market_new" USING ("market"::text::"Market_new");
ALTER TYPE "Market" RENAME TO "Market_old";
ALTER TYPE "Market_new" RENAME TO "Market";
DROP TYPE "public"."Market_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "OrderStatus_new" AS ENUM ('NEW');
ALTER TABLE "public"."Order" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Order" ALTER COLUMN "status" TYPE "OrderStatus_new" USING ("status"::text::"OrderStatus_new");
ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";
ALTER TYPE "OrderStatus_new" RENAME TO "OrderStatus";
DROP TYPE "public"."OrderStatus_old";
ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'NEW';
COMMIT;

-- AlterTable
ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'NEW';
