import { Suspense } from 'react'
import type { Metadata } from 'next'
import { CardsFinder } from '@/modules/cards/containers/CardsFinder/CardsFinder'

interface CardsPageProps {
  searchParams: Promise<{ q?: string }>
}

export async function generateMetadata({ searchParams }: CardsPageProps): Promise<Metadata> {
  const { q } = await searchParams
  return {
    title: q ? `${q} - Next Deck` : 'Next Deck',
  }
}

export default function CardsPage() {
  return (
    <Suspense>
      <CardsFinder />
    </Suspense>
  )
}
