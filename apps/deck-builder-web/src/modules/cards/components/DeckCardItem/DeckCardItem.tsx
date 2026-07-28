'use client'

import Image from 'next/image'
import { Plus, Minus } from 'lucide-react'
import type { IDeckCard } from '@/modules/cards/hooks/useDeckStore/useDeckStore'
import { BanlistStatusIcon } from '@/modules/common/components/BanlistStatusIcon/BanlistStatusIcon'
import { cn } from '@/lib/utils'

export interface DeckCardItemProps {
  deckCard: IDeckCard
  maxCopies: number
  isAnimating: boolean
  onDecrease: () => void
  onIncrease: () => void
}

export function DeckCardItem({ deckCard, maxCopies, isAnimating, onDecrease, onIncrease }: DeckCardItemProps) {
  const { card, quantity } = deckCard
  const imageUrl = card.cardImages[0]?.imageUrlSmall
  const banStatus = card.banStatusTcg

  return (
    <div className={cn(
      'flex items-center gap-2 p-1.5 rounded-md transition-all duration-200 hover:bg-muted/50',
      isAnimating && 'bg-primary/20 scale-[1.02]',
    )}>
      <div className="relative w-10 h-14 rounded overflow-hidden bg-muted shrink-0">
        {imageUrl ? (
          <Image src={imageUrl} alt={card.name} fill sizes="40px" className="object-cover" unoptimized />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-[8px]">No img</div>
        )}
        {(banStatus === 'FORBIDDEN' || banStatus === 'LIMITED' || banStatus === 'SEMI_LIMITED') && (
          <BanlistStatusIcon status={banStatus} size="sm" className="absolute -top-1.5 -left-1.5 z-10" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{card.name}</p>
      </div>
      <div className="flex items-center gap-1 rounded-md border border-border bg-muted/30 p-2">
        <button
          className="flex items-center justify-center p-1.5 rounded-md hover:bg-muted cursor-pointer"
          onClick={(e) => { e.stopPropagation(); onDecrease() }}
        >
          <Minus className="h-3 w-3" />
        </button>
        <span className="text-[10px] font-medium min-w-[3ch] text-center">{quantity}/{maxCopies}</span>
        <button
          className="flex items-center justify-center p-1.5 rounded-md hover:bg-muted cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          onClick={(e) => { e.stopPropagation(); onIncrease() }}
          disabled={quantity >= maxCopies}
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}
