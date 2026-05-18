import { PrismaClient } from '../../../generated/prisma/client';
import {
  mapApiCardToCreateInput,
  mapCardImages,
  mapCardSets,
  shouldSkipCard,
} from './utils';
import { fetchAllCards } from './fetchers';
import { YgoApiCard } from './types';

const BATCH_SIZE = 500;

async function clearDatabase(prisma: PrismaClient): Promise<void> {
  console.log('Clearing existing card data...');
  await prisma.cardImage.deleteMany();
  await prisma.cardSet.deleteMany();
  await prisma.card.deleteMany();
}

async function insertCards(
  prisma: PrismaClient,
  apiCards: YgoApiCard[],
): Promise<Map<number, number>> {
  const cardsToSeed = apiCards.filter((card) => !shouldSkipCard(card));
  const skippedCount = apiCards.length - cardsToSeed.length;

  console.log(
    `Seeding ${cardsToSeed.length} cards (${skippedCount} skill cards skipped)...`,
  );

  for (let i = 0; i < cardsToSeed.length; i += BATCH_SIZE) {
    const batch = cardsToSeed.slice(i, i + BATCH_SIZE);
    await prisma.card.createMany({
      data: batch.map(mapApiCardToCreateInput),
    });
    console.log(
      `  Inserted cards ${i + 1}-${Math.min(i + BATCH_SIZE, cardsToSeed.length)}`,
    );
  }

  const persistedCards = await prisma.card.findMany({
    select: { id: true, ygoId: true },
  });

  return new Map(persistedCards.map((card) => [card.ygoId, card.id]));
}

async function insertRelatedData(
  prisma: PrismaClient,
  apiCards: YgoApiCard[],
  ygoIdToCardId: Map<number, number>,
): Promise<void> {
  const cardSets: ReturnType<typeof mapCardSets> = [];
  const cardImages: ReturnType<typeof mapCardImages> = [];

  for (const apiCard of apiCards) {
    if (shouldSkipCard(apiCard)) continue;

    const cardId = ygoIdToCardId.get(apiCard.id);
    if (!cardId) {
      throw new Error(`Missing database row for YGOProDeck card ${apiCard.id}`);
    }

    cardSets.push(...mapCardSets(cardId, apiCard));
    cardImages.push(...mapCardImages(cardId, apiCard));
  }

  console.log(`Inserting ${cardSets.length} card sets...`);
  for (let i = 0; i < cardSets.length; i += BATCH_SIZE) {
    await prisma.cardSet.createMany({
      data: cardSets.slice(i, i + BATCH_SIZE),
    });
  }

  console.log(`Inserting ${cardImages.length} card images...`);
  for (let i = 0; i < cardImages.length; i += BATCH_SIZE) {
    await prisma.cardImage.createMany({
      data: cardImages.slice(i, i + BATCH_SIZE),
    });
  }
}

export async function seedCards(prisma: PrismaClient): Promise<void> {
  const apiCards = await fetchAllCards();
  await clearDatabase(prisma);
  const ygoIdToCardId = await insertCards(prisma, apiCards);
  await insertRelatedData(prisma, apiCards, ygoIdToCardId);
  const [cardCount, setCount, imageCount] = await Promise.all([
    prisma.card.count(),
    prisma.cardSet.count(),
    prisma.cardImage.count(),
  ]);

  console.log('Seed completed successfully.');
  console.log(`  Cards:  ${cardCount}`);
  console.log(`  Sets:   ${setCount}`);
  console.log(`  Images: ${imageCount}`);
}
