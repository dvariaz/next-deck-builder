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
  const canAddCard = useDeckStore.use.canAddCard()
  const getMaxCopies = useDeckStore.use.getMaxCopies()
  const deckCards = useDeckStore.use.deckCards()

  const isForbidden = card.banStatusTcg === 'FORBIDDEN'
  const currentCount = deckCards.find((dc) => dc.card.id === card.id)?.quantity ?? 0
  const maxCopies = getMaxCopies(card)
  const canAdd = canAddCard(card)
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
      'absolute inset-0 flex flex-col items-center gap-4 bg-black/60 backdrop-blur-xs opacity-0 transition-opacity duration-200 p-4',
      isHovered && 'opacity-100',
    )}>
      <span className="flex flex-col items-center gap-1.5 text-xs font-semibold text-foreground/80 px-8 pt-8 pb-4">
        <Eye className="h-4 w-4" />
        Preview
      </span>

      {isForbidden ? (
        <span className="flex justify-center items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium text-muted-foreground bg-background/80 w-full border-border hover:border-muted-foreground/50">
          <Ban className="h-3.5 w-3.5" />Forbidden
        </span>
      ) : currentCount === 0 ? (
        <button
          className="flex justify-center items-center gap-1.5 rounded-lg px-4 py-2.5 transition-colors text-xs font-medium text-foreground bg-background/80 hover:bg-background/60 cursor-pointer w-full border border-border hover:border-muted-foreground/50"
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
        className="flex items-center justify-center gap-1.5 rounded-lg p-2.5 text-xs font-medium text-foreground border border-border hover:border-muted-foreground/50 bg-background/80 hover:bg-background/60 transition-colors w-full"
      >
        <ExternalLink className="h-3 w-3" />TCGPlayer
      </a>
    </div>
  )
}
