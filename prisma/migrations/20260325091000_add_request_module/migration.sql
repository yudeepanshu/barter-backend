-- Create request table
CREATE TABLE "Request" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "allowProductAccess" BOOLEAN NOT NULL DEFAULT false,
    "message" TEXT,
    "contactPreference" TEXT NOT NULL DEFAULT 'BOTH',
    "lifecycleVersion" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Request_pkey" PRIMARY KEY ("id")
);

-- Create request offer table
CREATE TABLE "RequestOffer" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "offeredById" TEXT NOT NULL,
    "lifecycleVersion" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "offeredAmount" DECIMAL(12,2),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestOffer_pkey" PRIMARY KEY ("id")
);

-- Create request offer products join table
CREATE TABLE "RequestOfferProduct" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestOfferProduct_pkey" PRIMARY KEY ("id")
);

-- Create request visible products join table
CREATE TABLE "RequestVisibleProduct" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestVisibleProduct_pkey" PRIMARY KEY ("id")
);

-- Create indexes for request access patterns
CREATE INDEX "request_product_status_idx" ON "Request"("productId", "status");
CREATE INDEX "request_buyer_status_idx" ON "Request"("buyerId", "status");
CREATE INDEX "request_seller_status_idx" ON "Request"("sellerId", "status");
CREATE INDEX "request_offer_request_status_idx" ON "RequestOffer"("requestId", "status");
CREATE INDEX "request_offer_product_product_idx" ON "RequestOfferProduct"("productId");
CREATE INDEX "request_visible_product_product_idx" ON "RequestVisibleProduct"("productId");

-- Create uniqueness constraints
CREATE UNIQUE INDEX "request_offer_product_unique" ON "RequestOfferProduct"("offerId", "productId");
CREATE UNIQUE INDEX "request_visible_product_unique" ON "RequestVisibleProduct"("requestId", "productId");

-- Add foreign keys
ALTER TABLE "Request"
ADD CONSTRAINT "Request_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Request"
ADD CONSTRAINT "Request_buyerId_fkey"
FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Request"
ADD CONSTRAINT "Request_sellerId_fkey"
FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RequestOffer"
ADD CONSTRAINT "RequestOffer_requestId_fkey"
FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RequestOffer"
ADD CONSTRAINT "RequestOffer_offeredById_fkey"
FOREIGN KEY ("offeredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RequestOfferProduct"
ADD CONSTRAINT "RequestOfferProduct_offerId_fkey"
FOREIGN KEY ("offerId") REFERENCES "RequestOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RequestOfferProduct"
ADD CONSTRAINT "RequestOfferProduct_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RequestVisibleProduct"
ADD CONSTRAINT "RequestVisibleProduct_requestId_fkey"
FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RequestVisibleProduct"
ADD CONSTRAINT "RequestVisibleProduct_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
