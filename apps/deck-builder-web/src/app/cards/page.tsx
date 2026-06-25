import { Suspense } from 'react'
import { CardsFinder } from '@/modules/cards/containers/CardsFinder/CardsFinder'

export default function CardsPage() {
  return (
    <Suspense>
      <CardsFinder />
    </Suspense>
  )
}
