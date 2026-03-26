-- AlterTable
ALTER TABLE "Request" ADD COLUMN "updateCount" INTEGER NOT NULL DEFAULT 0;

-- Delete duplicate requests, keeping only the newest one per (productId, buyerId, sellerId)
DELETE FROM "Request"
WHERE id NOT IN (
  SELECT MAX(id)
  FROM "Request"
  GROUP BY "productId", "buyerId", "sellerId"
);

-- CreateIndex
CREATE UNIQUE INDEX "request_unique_buyer_product_seller" ON "Request"("productId", "buyerId", "sellerId");
