-- AlterTable
ALTER TABLE "Card" ADD COLUMN     "cardEffects" JSONB,
ADD COLUMN     "effectsParsedAt" TIMESTAMP(3);
