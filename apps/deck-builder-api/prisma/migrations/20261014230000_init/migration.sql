-- Initial schema for deck-builder-api.
--
-- Squashed from the ten incremental migrations that preceded it. The app has
-- never been deployed, so there was no history worth preserving; this file was
-- generated with `prisma migrate diff --from-empty` and verified by applying it
-- to a scratch database and diffing 123 schema facts (columns, indexes, enums,
-- foreign keys) against the live one — identical.
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "CardType" AS ENUM ('MONSTER', 'SPELL', 'TRAP');

-- CreateEnum
CREATE TYPE "SummonType" AS ENUM ('NORMAL', 'RITUAL', 'FUSION', 'SYNCHRO', 'XYZ', 'LINK');

-- CreateEnum
CREATE TYPE "MonsterEffectType" AS ENUM ('NORMAL', 'EFFECT', 'FLIP');

-- CreateEnum
CREATE TYPE "SpellTrapSubType" AS ENUM ('NORMAL', 'CONTINUOUS', 'QUICK_PLAY', 'EQUIP', 'FIELD', 'RITUAL', 'COUNTER');

-- CreateEnum
CREATE TYPE "CardFrameType" AS ENUM ('NORMAL', 'EFFECT', 'RITUAL', 'FUSION', 'SYNCHRO', 'XYZ', 'PENDULUM', 'LINK', 'TOKEN');

-- CreateEnum
CREATE TYPE "BanStatus" AS ENUM ('FORBIDDEN', 'LIMITED', 'SEMI_LIMITED', 'UNLIMITED');

-- CreateTable
CREATE TABLE "Card" (
    "id" SERIAL NOT NULL,
    "ygoId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "cardType" "CardType" NOT NULL,
    "frameType" "CardFrameType" NOT NULL,
    "description" TEXT NOT NULL,
    "archetype" TEXT,
    "ygoprodeckUrl" TEXT,
    "banStatusTcg" "BanStatus",
    "banStatusOcg" "BanStatus",
    "atk" INTEGER,
    "def" INTEGER,
    "level" INTEGER,
    "linkVal" INTEGER,
    "linkMarkers" TEXT[],
    "scale" INTEGER,
    "attribute" TEXT,
    "race" TEXT,
    "summonType" "SummonType",
    "monsterEffectType" "MonsterEffectType",
    "spellTrapSubType" "SpellTrapSubType",
    "isEffect" BOOLEAN NOT NULL DEFAULT false,
    "isFlip" BOOLEAN NOT NULL DEFAULT false,
    "isTuner" BOOLEAN NOT NULL DEFAULT false,
    "isPendulum" BOOLEAN NOT NULL DEFAULT false,
    "isToon" BOOLEAN NOT NULL DEFAULT false,
    "isSpirit" BOOLEAN NOT NULL DEFAULT false,
    "isUnion" BOOLEAN NOT NULL DEFAULT false,
    "isGemini" BOOLEAN NOT NULL DEFAULT false,
    "isToken" BOOLEAN NOT NULL DEFAULT false,
    "aiTags" JSONB,
    "aiLabeledAt" TIMESTAMP(3),
    "parsedEffects" JSONB,
    "betaName" TEXT,
    "treatedAs" TEXT,
    "formats" TEXT[],
    "upvotes" INTEGER,
    "downvotes" INTEGER,
    "konamiId" INTEGER,
    "mdRarity" TEXT,
    "tcgDate" TIMESTAMP(3),
    "ocgDate" TIMESTAMP(3),

    CONSTRAINT "Card_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardSet" (
    "id" SERIAL NOT NULL,
    "setName" TEXT NOT NULL,
    "setCode" TEXT NOT NULL,
    "setRarity" TEXT NOT NULL,
    "setRarityCode" TEXT NOT NULL,
    "cardId" INTEGER NOT NULL,

    CONSTRAINT "CardSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardImage" (
    "id" SERIAL NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "imageUrlSmall" TEXT NOT NULL,
    "imageUrlCropped" TEXT NOT NULL,
    "cardId" INTEGER NOT NULL,

    CONSTRAINT "CardImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardEffectParse" (
    "id" UUID NOT NULL,
    "cardId" INTEGER NOT NULL,
    "sourceText" TEXT NOT NULL,
    "effectKind" TEXT NOT NULL,
    "ast" JSONB NOT NULL,
    "confidence" DECIMAL(4,3) NOT NULL,
    "parserVersion" INTEGER NOT NULL,
    "origin" TEXT NOT NULL DEFAULT 'rules',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardEffectParse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardEffectDiagnostic" (
    "id" UUID NOT NULL,
    "parseId" UUID NOT NULL,
    "severity" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "span" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardEffectDiagnostic_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Card_ygoId_key" ON "Card"("ygoId");

-- CreateIndex
CREATE UNIQUE INDEX "Card_name_key" ON "Card"("name");

-- CreateIndex
CREATE INDEX "Card_archetype_idx" ON "Card"("archetype");

-- CreateIndex
CREATE INDEX "Card_cardType_idx" ON "Card"("cardType");

-- CreateIndex
CREATE INDEX "Card_level_idx" ON "Card"("level");

-- CreateIndex
CREATE INDEX "Card_cardType_archetype_idx" ON "Card"("cardType", "archetype");

-- CreateIndex
CREATE INDEX "CardEffectParse_parserVersion_idx" ON "CardEffectParse"("parserVersion");

-- CreateIndex
CREATE INDEX "CardEffectParse_effectKind_idx" ON "CardEffectParse"("effectKind");

-- CreateIndex
CREATE INDEX "CardEffectParse_confidence_idx" ON "CardEffectParse"("confidence");

-- CreateIndex
CREATE UNIQUE INDEX "CardEffectParse_cardId_parserVersion_key" ON "CardEffectParse"("cardId", "parserVersion");

-- CreateIndex
CREATE INDEX "CardEffectDiagnostic_parseId_idx" ON "CardEffectDiagnostic"("parseId");

-- CreateIndex
CREATE INDEX "CardEffectDiagnostic_code_idx" ON "CardEffectDiagnostic"("code");

-- CreateIndex
CREATE INDEX "CardEffectDiagnostic_severity_idx" ON "CardEffectDiagnostic"("severity");

-- AddForeignKey
ALTER TABLE "CardSet" ADD CONSTRAINT "CardSet_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardImage" ADD CONSTRAINT "CardImage_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardEffectParse" ADD CONSTRAINT "CardEffectParse_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardEffectDiagnostic" ADD CONSTRAINT "CardEffectDiagnostic_parseId_fkey" FOREIGN KEY ("parseId") REFERENCES "CardEffectParse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

