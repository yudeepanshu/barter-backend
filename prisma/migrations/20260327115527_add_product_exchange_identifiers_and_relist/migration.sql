-- DropForeignKey
ALTER TABLE "RequestOffer" DROP CONSTRAINT "RequestOffer_requestId_fkey";

-- DropForeignKey
ALTER TABLE "RequestOfferProduct" DROP CONSTRAINT "RequestOfferProduct_offerId_fkey";

-- DropForeignKey
ALTER TABLE "RequestVisibleProduct" DROP CONSTRAINT "RequestVisibleProduct_requestId_fkey";

-- AddForeignKey
ALTER TABLE "RequestOffer" ADD CONSTRAINT "RequestOffer_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestOfferProduct" ADD CONSTRAINT "RequestOfferProduct_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "RequestOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestVisibleProduct" ADD CONSTRAINT "RequestVisibleProduct_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "product_single_active_reservation" RENAME TO "ProductReservation_productId_key";

-- RenameIndex
ALTER INDEX "request_unique_buyer_product_seller" RENAME TO "Request_productId_buyerId_sellerId_key";

-- RenameIndex
ALTER INDEX "request_offer_product_unique" RENAME TO "RequestOfferProduct_offerId_productId_key";

-- RenameIndex
ALTER INDEX "request_visible_product_unique" RENAME TO "RequestVisibleProduct_requestId_productId_key";
