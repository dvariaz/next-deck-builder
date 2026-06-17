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
    "isToken" BOOLEAN NOT NULL DEFAULT false,
    "aiTags" JSONB,
    "aiLabeledAt" TIMESTAMP(3),

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

-- CreateIndex
CREATE UNIQUE INDEX "Card_ygoId_key" ON "Card"("ygoId");

-- CreateIndex
CREATE UNIQUE INDEX "Card_name_key" ON "Card"("name");

-- AddForeignKey
ALTER TABLE "CardSet" ADD CONSTRAINT "CardSet_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardImage" ADD CONSTRAINT "CardImage_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;
