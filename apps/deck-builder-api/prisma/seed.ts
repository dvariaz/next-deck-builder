import 'dotenv/config';
import { PrismaClient } from '../generated/prisma/client';
import { createPrismaAdapter } from './prisma-adapter.factory'

// Seeders
import { seedCards } from './seeds/cards/seed';

const prisma = new PrismaClient({
  adapter: createPrismaAdapter()
})

async function main(): Promise<void> {
  await seedCards(prisma);
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exit(1);
  }).finally(async () => {
    await prisma.$disconnect();
  });
