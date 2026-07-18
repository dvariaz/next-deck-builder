'use client'

import { useState, useMemo, useEffect } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import type { CardResponseDto } from '@/generated/model'
import { useFilterStore } from '@/modules/filters/hooks/useFilterStore/useFilterStore'
import { useCardsInfinite } from '@/modules/cards/hooks/useCardsInfinite/useCardsInfinite'
import { CardItem } from '@/modules/cards/components/CardItem/CardItem'
import { CardPreviewDialog } from '@/modules/cards/components/CardPreviewDialog/CardPreviewDialog'
import { CardGridSkeleton } from '@/modules/cards/components/CardSkeleton/CardSkeleton'
import { Button } from '@/modules/common/components/Button/Button'
import { sortCards } from '@/modules/cards/utils/sortCards'

export function CardGrid() {
  const [previewCard, setPreviewCard] = useState<CardResponseDto | null>(null)
  const params = useFilterStore(useShallow((s) => s.toQueryParams()))
  const search = useFilterStore.use.search()
  const sortField = useFilterStore.use.sortField()
  const sortDirection = useFilterStore.use.sortDirection()
  const { cards, total, isFetching, isFetchingNextPage, hasNextPage, fetchNextPage, isError } = useCardsInfinite(params)

  const sortedCards = useMemo(
    () => sortCards(cards, sortField, sortDirection),
    [cards, sortField, sortDirection],
  )

  useEffect(() => {
    document.title = previewCard
      ? `${previewCard.name} - Next Deck`
      : search
        ? `${search} - Next Deck`
        : 'Next Deck'
  }, [previewCard, search])

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center">
        <p className="text-sm font-medium text-destructive">Failed to load cards</p>
        <p className="text-xs text-muted-foreground mt-1">Check that the API server is running.</p>
      </div>
    )
  }

  if (isFetching && cards.length === 0) {
    return (
      <div className="space-y-4">
        <div className="text-sm text-muted-foreground animate-pulse">Loading cards...</div>
        <div className="grid grid-cols-2 @sm:grid-cols-3 @4xl:grid-cols-4 @6xl:grid-cols-5 gap-4">
          <CardGridSkeleton count={15} />
        </div>
      </div>
    )
  }

  if (!isFetching && cards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] rounded-lg border border-border p-8 text-center">
        <Search className="h-8 w-8 text-muted-foreground/50 mb-4" />
        <p className="text-sm font-medium text-foreground">No cards found</p>
        <p className="text-xs text-muted-foreground mt-1">Try adjusting your filters or search terms.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="text-sm text-muted-foreground">
        Showing{' '}
        <span className="text-foreground font-medium">{sortedCards.length.toLocaleString()}</span>
        {' '}of{' '}
        <span className="text-foreground font-medium">{total.toLocaleString()}</span>{' '}
        cards
      </div>

      <div className="grid grid-cols-2 @md:grid-cols-3 @lg:grid-cols-4 @2xl:grid-cols-5 gap-4">
        {sortedCards.map((card, index) => (
          <CardItem
            key={card.id}
            card={card}
            priority={index < 10}
            onPreview={setPreviewCard}
            className="animate-in fade-in slide-in-from-bottom-3 duration-500 fill-mode-backwards"
            style={{ animationDelay: `${(index % 10) * 40}ms` }}
          />
        ))}
        {isFetchingNextPage && <CardGridSkeleton count={6} />}
      </div>

      {hasNextPage && (
        <div className="flex justify-center pt-4">
          <Button
            variant="outline"
            size="lg"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="gap-2"
          >
            <ChevronDown className="h-4 w-4" />
            {isFetchingNextPage ? 'Loading...' : `Load more (${(total - sortedCards.length).toLocaleString()} remaining)`}
          </Button>
        </div>
      )}

      <CardPreviewDialog
        card={previewCard}
        open={previewCard !== null}
        onOpenChange={(open) => { if (!open) setPreviewCard(null) }}
      />
    </div>
  )
}
