-- AlterTable
ALTER TABLE "Card" ADD COLUMN     "cardEffects" JSONB,
ADD COLUMN     "effectsParsedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Card_archetype_idx" ON "Card"("archetype");

-- CreateIndex
CREATE INDEX "Card_cardType_idx" ON "Card"("cardType");

-- CreateIndex
CREATE INDEX "Card_level_idx" ON "Card"("level");

-- CreateIndex
CREATE INDEX "Card_cardType_archetype_idx" ON "Card"("cardType", "archetype");
