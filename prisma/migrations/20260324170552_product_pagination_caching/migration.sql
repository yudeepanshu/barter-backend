-- CreateIndex
CREATE INDEX "product_list_cursor_idx" ON "Product"("status", "isListed", "createdAt", "id");

-- CreateIndex
CREATE INDEX "product_location_idx" ON "Product"("latitude", "longitude");
