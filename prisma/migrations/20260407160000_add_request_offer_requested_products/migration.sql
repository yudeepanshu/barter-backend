-- CreateTable
CREATE TABLE "RequestOfferRequestedProduct" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestOfferRequestedProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "request_offer_requested_product_unique" ON "RequestOfferRequestedProduct"("offerId", "productId");

-- CreateIndex
CREATE INDEX "request_offer_requested_product_product_idx" ON "RequestOfferRequestedProduct"("productId");

-- AddForeignKey
ALTER TABLE "RequestOfferRequestedProduct" ADD CONSTRAINT "RequestOfferRequestedProduct_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "RequestOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestOfferRequestedProduct" ADD CONSTRAINT "RequestOfferRequestedProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
