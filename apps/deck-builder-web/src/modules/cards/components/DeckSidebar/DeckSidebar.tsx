'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Layers, Trash2, Plus, Minus, X, ChevronLeft, ChevronRight, Swords, Wand2, ShieldAlert } from 'lucide-react'
import type { CardResponseDto } from '@/generated/model'
import { useDeckStore, type IDeckCard } from '@/modules/cards/hooks/useDeckStore/useDeckStore'
import { Button } from '@/modules/common/components/Button/Button'
import { ScrollArea } from '@/modules/common/components/ScrollArea/ScrollArea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/modules/common/components/Tooltip/Tooltip'
import { cn } from '@/lib/utils'

const EXTRA_DECK_FRAME_TYPES = new Set(['FUSION', 'SYNCHRO', 'XYZ', 'LINK'])

function isExtraDeck(card: CardResponseDto): boolean {
  return EXTRA_DECK_FRAME_TYPES.has(card.frameType)
}

interface DeckCardItemProps {
  deckCard: IDeckCard
  maxCopies: number
  isAnimating: boolean
  onDecrease: () => void
  onIncrease: () => void
  onRemove: () => void
}

function DeckCardItem({ deckCard, maxCopies, isAnimating, onDecrease, onIncrease, onRemove }: DeckCardItemProps) {
  const { card, quantity } = deckCard
  const imageUrl = card.cardImages[0]?.imageUrlSmall

  return (
    <div className={cn(
      'flex items-center gap-2 p-1.5 rounded-md transition-all duration-200 hover:bg-muted/50 group',
      isAnimating && 'bg-primary/20 scale-[1.02]',
    )}>
      <div className="relative w-10 h-14 rounded overflow-hidden bg-muted shrink-0">
        {imageUrl ? (
          <Image src={imageUrl} alt={card.name} fill sizes="40px" className="object-cover" unoptimized />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-[8px]">No img</div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{card.name}</p>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span>x{quantity}</span>
          <span className="text-muted-foreground/50">/ {maxCopies} max</span>
        </div>
      </div>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); onDecrease() }}>
          <Minus className="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); onIncrease() }} disabled={quantity >= maxCopies}>
          <Plus className="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); onRemove() }}>
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  )
}

export function DeckSidebar() {
  const [isCollapsed, setIsCollapsed] = useState(true)

  const deckCards = useDeckStore.use.deckCards()
  const lastAddedCardId = useDeckStore.use.lastAddedCardId()
  const addCard = useDeckStore.use.addCard()
  const removeCard = useDeckStore.use.removeCard()
  const decreaseCard = useDeckStore.use.decreaseCard()
  const clearDeck = useDeckStore.use.clearDeck()
  const getTotalCards = useDeckStore.use.getTotalCards()
  const getMaxCopies = useDeckStore.use.getMaxCopies()

  const totalCards = getTotalCards()

  const mainDeckMonsters = deckCards.filter((dc) => dc.card.cardType === 'MONSTER' && !isExtraDeck(dc.card))
  const extraDeck = deckCards.filter((dc) => dc.card.cardType === 'MONSTER' && isExtraDeck(dc.card))
  const spells = deckCards.filter((dc) => dc.card.cardType === 'SPELL')
  const traps = deckCards.filter((dc) => dc.card.cardType === 'TRAP')

  const monsterCount = mainDeckMonsters.reduce((s, dc) => s + dc.quantity, 0)
  const spellCount = spells.reduce((s, dc) => s + dc.quantity, 0)
  const trapCount = traps.reduce((s, dc) => s + dc.quantity, 0)
  const extraCount = extraDeck.reduce((s, dc) => s + dc.quantity, 0)
  const mainTotal = monsterCount + spellCount + trapCount

  if (isCollapsed) {
    return (
      <div className="hidden lg:flex flex-col items-center py-4 px-2 border-l border-border bg-card/50 w-14">
        <Button variant="ghost" size="icon" onClick={() => setIsCollapsed(false)} className="mb-4">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex flex-col items-center gap-1 p-2 rounded-lg bg-primary/10 cursor-default">
              <Layers className="h-5 w-5 text-primary" />
              <span className="text-xs font-bold text-primary">{totalCards}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="left">Deck: {totalCards} cards</TooltipContent>
        </Tooltip>
      </div>
    )
  }

  return (
    <aside className="hidden lg:flex flex-col w-80 border-l border-border bg-card/50 h-[calc(100vh-4rem)] sticky top-16">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20">
            <Layers className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold text-sm">Deck Draft</h2>
            <p className="text-xs text-muted-foreground">{totalCards} cards</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {totalCards > 0 && (
            <Button variant="ghost" size="icon" onClick={clearDeck} className="h-8 w-8 text-muted-foreground hover:text-destructive">
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={() => setIsCollapsed(true)} className="h-8 w-8">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-1 p-3 border-b border-border bg-muted/30 text-xs">
        {[
          { icon: <Swords className="h-3.5 w-3.5 text-orange-400" />, count: monsterCount, label: 'Monsters' },
          { icon: <Wand2 className="h-3.5 w-3.5 text-green-400" />, count: spellCount, label: 'Spells' },
          { icon: <ShieldAlert className="h-3.5 w-3.5 text-purple-400" />, count: trapCount, label: 'Traps' },
          { icon: <Layers className="h-3.5 w-3.5 text-blue-400" />, count: extraCount, label: 'Extra' },
        ].map(({ icon, count, label }) => (
          <div key={label} className="flex flex-col items-center gap-0.5">
            {icon}
            <span className="font-semibold">{count}</span>
            <span className="text-[10px] text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>

      {/* Card list */}
      <ScrollArea className="flex-1">
        {totalCards === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center p-4">
            <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
              <Layers className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <p className="text-sm text-muted-foreground">Your deck is empty</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Hover over cards and click + to add them</p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {mainDeckMonsters.length > 0 && (
              <div className="mb-3">
                <div className="flex items-center gap-2 px-2 py-1.5 text-xs font-medium text-orange-400 uppercase tracking-wider">
                  <Swords className="h-3 w-3" />Monsters ({monsterCount})
                </div>
                {mainDeckMonsters.map((dc) => (
                  <DeckCardItem
                    key={dc.card.id}
                    deckCard={dc}
                    maxCopies={getMaxCopies(dc.card)}
                    isAnimating={lastAddedCardId === dc.card.id}
                    onDecrease={() => decreaseCard(dc.card.id)}
                    onIncrease={() => addCard(dc.card)}
                    onRemove={() => removeCard(dc.card.id)}
                  />
                ))}
              </div>
            )}
            {spells.length > 0 && (
              <div className="mb-3">
                <div className="flex items-center gap-2 px-2 py-1.5 text-xs font-medium text-green-400 uppercase tracking-wider">
                  <Wand2 className="h-3 w-3" />Spells ({spellCount})
                </div>
                {spells.map((dc) => (
                  <DeckCardItem
                    key={dc.card.id}
                    deckCard={dc}
                    maxCopies={getMaxCopies(dc.card)}
                    isAnimating={lastAddedCardId === dc.card.id}
                    onDecrease={() => decreaseCard(dc.card.id)}
                    onIncrease={() => addCard(dc.card)}
                    onRemove={() => removeCard(dc.card.id)}
                  />
                ))}
              </div>
            )}
            {traps.length > 0 && (
              <div className="mb-3">
                <div className="flex items-center gap-2 px-2 py-1.5 text-xs font-medium text-purple-400 uppercase tracking-wider">
                  <ShieldAlert className="h-3 w-3" />Traps ({trapCount})
                </div>
                {traps.map((dc) => (
                  <DeckCardItem
                    key={dc.card.id}
                    deckCard={dc}
                    maxCopies={getMaxCopies(dc.card)}
                    isAnimating={lastAddedCardId === dc.card.id}
                    onDecrease={() => decreaseCard(dc.card.id)}
                    onIncrease={() => addCard(dc.card)}
                    onRemove={() => removeCard(dc.card.id)}
                  />
                ))}
              </div>
            )}
            {extraDeck.length > 0 && (
              <div className="mb-3">
                <div className="flex items-center gap-2 px-2 py-1.5 text-xs font-medium text-blue-400 uppercase tracking-wider">
                  <Layers className="h-3 w-3" />Extra Deck ({extraCount})
                </div>
                {extraDeck.map((dc) => (
                  <DeckCardItem
                    key={dc.card.id}
                    deckCard={dc}
                    maxCopies={getMaxCopies(dc.card)}
                    isAnimating={lastAddedCardId === dc.card.id}
                    onDecrease={() => decreaseCard(dc.card.id)}
                    onIncrease={() => addCard(dc.card)}
                    onRemove={() => removeCard(dc.card.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      {/* Footer */}
      {totalCards > 0 && (
        <div className="p-3 border-t border-border bg-muted/30">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="text-muted-foreground">Main Deck</span>
            <span className={cn(
              'font-semibold',
              mainTotal >= 40 && mainTotal <= 60 ? 'text-green-400' : mainTotal > 60 ? 'text-red-400' : 'text-yellow-400',
            )}>
              {mainTotal}/40–60
            </span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full transition-all duration-300 rounded-full',
                mainTotal >= 40 && mainTotal <= 60 ? 'bg-green-500' : mainTotal > 60 ? 'bg-red-500' : 'bg-primary',
              )}
              style={{ width: `${Math.min((mainTotal / 60) * 100, 100)}%` }}
            />
          </div>
        </div>
      )}
    </aside>
  )
}
