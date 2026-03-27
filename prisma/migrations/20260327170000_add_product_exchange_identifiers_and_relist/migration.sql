-- AlterTable
ALTER TABLE "Product"
ADD COLUMN "lastExchangedAt" TIMESTAMP(3),
ADD COLUMN "exchangeCount" INTEGER NOT NULL DEFAULT 0;
