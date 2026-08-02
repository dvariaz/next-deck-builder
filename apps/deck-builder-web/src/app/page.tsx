import type { Metadata } from 'next'
import { cardsControllerFindAll } from '@/generated/api/cards/cards'
import { CardsControllerFindAllSort } from '@/generated/model'
import { LandingNav } from '@/modules/landing/components/LandingNav/LandingNav'
import { Hero } from '@/modules/landing/components/Hero/Hero'
import { Features } from '@/modules/landing/components/Features/Features'
import { HowItWorks } from '@/modules/landing/components/HowItWorks/HowItWorks'
import { LandingFooter } from '@/modules/landing/components/LandingFooter/LandingFooter'

export const metadata: Metadata = {
  title: 'Next Deck — Build the Yu-Gi-Oh! deck that wins',
  description:
    'Search the entire Yu-Gi-Oh! card database, filter by anything that matters, and forge a tournament-ready deck in one fast, focused builder.',
  openGraph: {
    title: 'Next Deck — Build the Yu-Gi-Oh! deck that wins',
    description:
      'Search the entire Yu-Gi-Oh! card database and forge a tournament-ready deck.',
    type: 'website',
  },
}

/**
 * Pull the newest cards for the animated hero wall. Runs on the server; if the
 * API is unreachable we degrade gracefully to the starfield-only background.
 */
async function getHeroCards(): Promise<{ images: string[]; total: number | null }> {
  try {
    const { data } = await cardsControllerFindAll(
      { take: 40, sort: CardsControllerFindAllSort.newest },
      { next: { revalidate: 300 } } as RequestInit,
    )
    const images = data.results.flatMap(
      (card) => card.cardImages[0]?.imageUrlSmall ?? [],
    )
    return { images, total: data.pagination.total }
  } catch {
    return { images: [], total: null }
  }
}

export default async function Home() {
  const { images, total } = await getHeroCards()

  return (
    <div className="min-h-screen bg-background">
      <LandingNav />
      <main>
        <Hero images={images} cardCount={total} />
        <Features />
        <HowItWorks />
      </main>
      <LandingFooter />
    </div>
  )
}
