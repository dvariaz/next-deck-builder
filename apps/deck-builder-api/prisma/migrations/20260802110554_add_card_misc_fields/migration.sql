-- AlterTable
ALTER TABLE "Card" ADD COLUMN     "betaName" TEXT,
ADD COLUMN     "downvotes" INTEGER,
ADD COLUMN     "formats" TEXT[],
ADD COLUMN     "konamiId" INTEGER,
ADD COLUMN     "mdRarity" TEXT,
ADD COLUMN     "ocgDate" TIMESTAMP(3),
ADD COLUMN     "tcgDate" TIMESTAMP(3),
ADD COLUMN     "treatedAs" TEXT,
ADD COLUMN     "upvotes" INTEGER;
