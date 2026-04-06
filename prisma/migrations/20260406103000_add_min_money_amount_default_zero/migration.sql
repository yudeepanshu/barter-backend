-- Add minimum money amount to products with safe defaults for existing data.
ALTER TABLE "Product"
ADD COLUMN IF NOT EXISTS "minMoneyAmount" DECIMAL(12,2);

UPDATE "Product"
SET "minMoneyAmount" = 0
WHERE "minMoneyAmount" IS NULL;

ALTER TABLE "Product"
ALTER COLUMN "minMoneyAmount" SET DEFAULT 0,
ALTER COLUMN "minMoneyAmount" SET NOT NULL;
