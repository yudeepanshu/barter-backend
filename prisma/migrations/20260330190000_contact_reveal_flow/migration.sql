-- Add per-side contact visibility flags on reservation
ALTER TABLE "ProductReservation"
ADD COLUMN "buyerCanViewSellerContact" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "sellerCanViewBuyerContact" BOOLEAN NOT NULL DEFAULT false;

-- Create one-time contact reveal request tracking
CREATE TABLE "ContactRevealRequest" (
  "id" TEXT NOT NULL,
  "reservationId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "requesterId" TEXT NOT NULL,
  "targetUserId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "respondedAt" TIMESTAMP(3),
  "respondedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ContactRevealRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "contact_reveal_once_per_direction" ON "ContactRevealRequest"("reservationId", "requesterId", "targetUserId");
CREATE INDEX "contact_reveal_request_status_idx" ON "ContactRevealRequest"("requestId", "status");
CREATE INDEX "contact_reveal_target_status_idx" ON "ContactRevealRequest"("targetUserId", "status");

ALTER TABLE "ContactRevealRequest"
ADD CONSTRAINT "ContactRevealRequest_reservationId_fkey"
FOREIGN KEY ("reservationId") REFERENCES "ProductReservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ContactRevealRequest"
ADD CONSTRAINT "ContactRevealRequest_requestId_fkey"
FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ContactRevealRequest"
ADD CONSTRAINT "ContactRevealRequest_requesterId_fkey"
FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ContactRevealRequest"
ADD CONSTRAINT "ContactRevealRequest_targetUserId_fkey"
FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ContactRevealRequest"
ADD CONSTRAINT "ContactRevealRequest_respondedById_fkey"
FOREIGN KEY ("respondedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
