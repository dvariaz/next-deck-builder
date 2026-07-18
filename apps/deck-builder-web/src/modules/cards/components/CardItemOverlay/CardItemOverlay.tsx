import { Eye, Plus, Minus, Ban, ExternalLink, CopyPlus } from 'lucide-react'
import type { CardResponseDto } from '@/generated/model'
import { useDeckStore } from '@/modules/cards/hooks/useDeckStore/useDeckStore'
import { cn } from '@/lib/utils'

interface CardItemOverlayProps {
  card: CardResponseDto
  isHovered: boolean
  onAdded: (result: { success: boolean; message: string }) => void
}

export function CardItemOverlay({
  card,
  isHovered,
  onAdded,
}: CardItemOverlayProps) {
  const addCard = useDeckStore.use.addCard()
  const decreaseCard = useDeckStore.use.decreaseCard()
  const getMaxCopies = useDeckStore.use.getMaxCopies()
  const currentCount = useDeckStore((s) => s.getCardCount(card.id))
  const canAdd = useDeckStore((s) => s.canAddCard(card))

  const isForbidden = card.banStatusTcg === 'FORBIDDEN'
  const isInDeck = currentCount > 0
  const maxCopies = getMaxCopies(card)
  const tcgPlayerUrl = `https://www.tcgplayer.com/search/all/product?q=${encodeURIComponent(card.name)}`

  const handleAddToDeck = (e: React.MouseEvent) => {
    e.stopPropagation()
    onAdded(addCard(card))
  }

  const handleDecreaseFromDeck = (e: React.MouseEvent) => {
    e.stopPropagation()
    decreaseCard(card.id)
  }

  return (
    <div className={cn(
      'absolute inset-0 flex flex-col items-center transition-opacity duration-200 p-2 @[200px]:p-4',
      isInDeck
        ? cn('opacity-100', isHovered && 'bg-black/60 backdrop-blur-xs')
        : cn('bg-black/60 backdrop-blur-xs opacity-0', isHovered && 'opacity-100'),
    )}>
      <span className={cn(
        'flex flex-col items-center justify-center gap-1.5 text-xs font-semibold text-foreground/80 px-2 pt-4 @[200px]:px-8 @[200px]:pt-8 transition-opacity duration-200 h-4/10',
        isInDeck && !isHovered && 'opacity-0 pointer-events-none',
      )}>
        <Eye className="h-4 w-4" />
        Preview
      </span>

      <div className="h-6/10 w-full flex flex-col gap-3">
        {isForbidden ? (
          <span className="flex justify-center items-center gap-1.5 rounded-lg px-2 py-1.5 @[200px]:px-4 @[200px]:py-2 text-xs font-medium text-muted-foreground bg-background/80 w-full border-border hover:border-muted-foreground/50">
            <Ban className="h-3.5 w-3.5" />Forbidden
          </span>
        ) : currentCount === 0 ? (
          <button
            className="flex justify-center items-center gap-1.5 rounded-lg px-2 py-2 @[200px]:px-4 @[200px]:py-2.5 transition-colors text-xs font-medium text-foreground bg-background/80 hover:bg-background/60 cursor-pointer w-full border border-border hover:border-muted-foreground/50"
            onClick={handleAddToDeck}
          >
            <CopyPlus className="h-3 w-3" />Add to Deck
          </button>
        ) : (
          <div
            className="flex items-center gap-2 rounded-lg px-1 py-1 bg-background/80 w-full transition-colors border border-border hover:border-muted-foreground/50 hover:bg-muted/50"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="flex items-center justify-center p-2 rounded-md hover:bg-background/60 cursor-pointer"
              onClick={handleDecreaseFromDeck}
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className="text-xs font-medium min-w-[2.5ch] text-center w-full">{currentCount}/{maxCopies}</span>
            <button
              className="flex items-center justify-center p-2 rounded-md hover:bg-background/60 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={handleAddToDeck}
              disabled={!canAdd}
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
        )}

        <a
          href={tcgPlayerUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'flex items-center justify-center gap-1.5 rounded-lg p-1.5 @[200px]:p-2.5 text-xs font-medium text-foreground border border-border hover:border-muted-foreground/50 bg-background/80 hover:bg-background/60 transition duration-200 w-full',
            isInDeck && !isHovered && 'opacity-0 pointer-events-none',
          )}
        >
          <ExternalLink className="h-3 w-3" />TCGPlayer
        </a>
      </div>
    </div>
  )
}
