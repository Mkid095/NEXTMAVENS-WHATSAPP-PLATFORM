-- AlterTable
ALTER TABLE "organizations" ADD COLUMN "email" TEXT;
ALTER TABLE "organizations" ADD COLUMN "taxRate" DOUBLE PRECISION;
ALTER TABLE "organizations" ADD COLUMN "taxName" TEXT;
ALTER TABLE "organizations" ADD COLUMN "taxId" TEXT;
