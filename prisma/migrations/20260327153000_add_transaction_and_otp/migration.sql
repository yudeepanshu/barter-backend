-- CreateTable
CREATE TABLE "Transaction" (
  "id" TEXT NOT NULL,
  "reservationId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "offerId" TEXT NOT NULL,
  "buyerId" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'INITIATED',
  "initiatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "cancelledReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionOTP" (
  "id" TEXT NOT NULL,
  "transactionId" TEXT NOT NULL,
  "generatedForId" TEXT NOT NULL,
  "otpHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "verifiedAt" TIMESTAMP(3),
  "invalidatedAt" TIMESTAMP(3),
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TransactionOTP_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_reservationId_key" ON "Transaction"("reservationId");

-- CreateIndex
CREATE INDEX "transaction_product_status_idx" ON "Transaction"("productId", "status");

-- CreateIndex
CREATE INDEX "transaction_buyer_status_idx" ON "Transaction"("buyerId", "status");

-- CreateIndex
CREATE INDEX "transaction_seller_status_idx" ON "Transaction"("sellerId", "status");

-- CreateIndex
CREATE INDEX "transaction_otp_lookup_idx" ON "TransactionOTP"("transactionId", "expiresAt");

-- CreateIndex
CREATE INDEX "transaction_otp_generated_for_idx" ON "TransactionOTP"("generatedForId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "ProductReservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "RequestOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionOTP" ADD CONSTRAINT "TransactionOTP_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionOTP" ADD CONSTRAINT "TransactionOTP_generatedForId_fkey" FOREIGN KEY ("generatedForId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
