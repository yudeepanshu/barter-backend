-- AlterTable
ALTER TABLE "Request"
ADD COLUMN "currentTurn" TEXT NOT NULL DEFAULT 'SELLER',
ADD COLUMN "cancelledById" TEXT,
ADD COLUMN "cancelledByRole" TEXT,
ADD COLUMN "cancelledReason" TEXT,
ADD COLUMN "acceptedOfferId" TEXT;

-- CreateTable
CREATE TABLE "ProductReservation" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "offerId" TEXT NOT NULL,
  "buyerId" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "isContactVisible" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "cancelledReason" TEXT,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProductReservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_single_active_reservation" ON "ProductReservation"("productId");

-- CreateIndex
CREATE INDEX "reservation_buyer_status_idx" ON "ProductReservation"("buyerId", "status");

-- CreateIndex
CREATE INDEX "reservation_seller_status_idx" ON "ProductReservation"("sellerId", "status");

-- AddForeignKey
ALTER TABLE "ProductReservation" ADD CONSTRAINT "ProductReservation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductReservation" ADD CONSTRAINT "ProductReservation_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductReservation" ADD CONSTRAINT "ProductReservation_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "RequestOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductReservation" ADD CONSTRAINT "ProductReservation_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductReservation" ADD CONSTRAINT "ProductReservation_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
