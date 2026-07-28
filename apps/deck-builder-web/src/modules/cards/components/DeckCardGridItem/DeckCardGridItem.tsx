'use client'

import Image from 'next/image'
import { Plus, Minus } from 'lucide-react'
import type { IDeckCard } from '@/modules/cards/hooks/useDeckStore/useDeckStore'
import { BanlistStatusIcon } from '@/modules/common/components/BanlistStatusIcon/BanlistStatusIcon'
import { cn } from '@/lib/utils'

export interface DeckCardGridItemProps {
  deckCard: IDeckCard
  maxCopies: number
  isAnimating: boolean
  onDecrease: () => void
  onIncrease: () => void
}

export function DeckCardGridItem({ deckCard, maxCopies, isAnimating, onDecrease, onIncrease }: DeckCardGridItemProps) {
  const { card, quantity } = deckCard
  const imageUrl = card.cardImages[0]?.imageUrlSmall
  const banStatus = card.banStatusTcg

  return (
    <div className={cn(
      'relative aspect-59/86 bg-muted transition-all duration-200',
      isAnimating && 'ring-2 ring-primary scale-[1.03]',
    )}>
      {imageUrl ? (
        <Image src={imageUrl} alt={card.name} fill sizes="120px" className="object-cover" unoptimized />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-muted-foreground text-[8px]">No img</div>
      )}
      {(banStatus === 'FORBIDDEN' || banStatus === 'LIMITED' || banStatus === 'SEMI_LIMITED') && (
        <BanlistStatusIcon status={banStatus} size="sm" className="absolute -top-1.5 -left-1.5 z-10" />
      )}
      <div
        className="absolute bottom-0 w-full p-1 pb-1.5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="inset-x-0 flex items-center justify-center gap-1 bg-black/70 backdrop-blur-xs p-1 rounded-md">
          <button
            className="flex items-center justify-center p-1 rounded-md text-white hover:bg-white/20 cursor-pointer"
            onClick={onDecrease}
          >
            <Minus className="h-3 w-3" />
          </button>
          <span className="text-[10px] font-medium text-white min-w-[3ch] text-center">{quantity}/{maxCopies}</span>
          <button
            className="flex items-center justify-center p-1 rounded-md text-white hover:bg-white/20 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={onIncrease}
            disabled={quantity >= maxCopies}
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  )
}
