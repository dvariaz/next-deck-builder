'use client'

import { useState, type ReactNode } from 'react'
import { Layers, Swords, Wand2, ShieldAlert, List, LayoutGrid } from 'lucide-react'
import type { CardResponseDto } from '@/generated/model'
import { useDeckStore, type IDeckCard } from '@/modules/cards/hooks/useDeckStore/useDeckStore'
import { DeckCardItem } from '@/modules/cards/components/DeckCardItem/DeckCardItem'
import { DeckCardGridItem } from '@/modules/cards/components/DeckCardGridItem/DeckCardGridItem'
import { Button } from '@/modules/common/components/Button/Button'
import { ScrollArea } from '@/modules/common/components/ScrollArea/ScrollArea'
import { cn } from '@/lib/utils'

const EXTRA_DECK_FRAME_TYPES = new Set(['FUSION', 'SYNCHRO', 'XYZ', 'LINK'])

function isExtraDeck(card: CardResponseDto): boolean {
  return EXTRA_DECK_FRAME_TYPES.has(card.frameType)
}

interface DeckSectionProps {
  viewMode: 'row' | 'grid'
  icon: ReactNode
  label: string
  count: number
  colorClass: string
  items: IDeckCard[]
  getMaxCopies: (card: CardResponseDto) => number
  lastAddedCardId: string | null
  onDecrease: (cardId: string) => void
  onIncrease: (deckCard: IDeckCard) => void
}

function DeckSection({ viewMode, icon, label, count, colorClass, items, getMaxCopies, lastAddedCardId, onDecrease, onIncrease }: DeckSectionProps) {
  if (items.length === 0) return null

  const ItemComponent = viewMode === 'grid' ? DeckCardGridItem : DeckCardItem

  return (
    <div className="mb-3">
      <div className={cn('flex items-center gap-2 px-2 pt-1.5 pb-3 text-xs font-medium uppercase tracking-wider', colorClass)}>
        {icon}{label} ({count})
      </div>
      <div className={cn(viewMode === 'grid' && 'grid grid-cols-3 gap-4 px-1')}>
        {items.map((dc) => (
          <ItemComponent
            key={dc.card.id}
            deckCard={dc}
            maxCopies={getMaxCopies(dc.card)}
            isAnimating={lastAddedCardId === dc.card.id}
            onDecrease={() => onDecrease(dc.card.id)}
            onIncrease={() => onIncrease(dc)}
          />
        ))}
      </div>
    </div>
  )
}

export function DeckPanel() {
  const [viewMode, setViewMode] = useState<'row' | 'grid'>('row')

  const deckCards = useDeckStore.use.deckCards()
  const lastAddedCardId = useDeckStore.use.lastAddedCardId()
  const addCard = useDeckStore.use.addCard()
  const decreaseCard = useDeckStore.use.decreaseCard()
  const totalCards = useDeckStore.use.totalCards()
  const getMaxCopies = useDeckStore.use.getMaxCopies()

  const mainDeckMonsters = deckCards.filter((dc) => dc.card.cardType === 'MONSTER' && !isExtraDeck(dc.card))
  const extraDeck = deckCards.filter((dc) => dc.card.cardType === 'MONSTER' && isExtraDeck(dc.card))
  const spells = deckCards.filter((dc) => dc.card.cardType === 'SPELL')
  const traps = deckCards.filter((dc) => dc.card.cardType === 'TRAP')

  const monsterCount = mainDeckMonsters.reduce((s, dc) => s + dc.quantity, 0)
  const spellCount = spells.reduce((s, dc) => s + dc.quantity, 0)
  const trapCount = traps.reduce((s, dc) => s + dc.quantity, 0)
  const extraCount = extraDeck.reduce((s, dc) => s + dc.quantity, 0)

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Stats bar */}
      <div className='flex items-center border-b border-border p-3 gap-2'>
        <div className="grid grid-cols-4 gap-1 bg-muted/30 text-xs flex-1">
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

        <div className="flex justify-end">
          <div className="flex items-center rounded-md border border-primary overflow-hidden mr-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setViewMode('row')}
                className={cn('h-8 w-8 rounded-none text-foreground/80', viewMode === 'row' && 'bg-primary/15 text-primary hover:bg-primary')}
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setViewMode('grid')}
                className={cn('h-8 w-8 rounded-none text-foreground/80', viewMode === 'grid' && 'bg-primary/15 text-primary hover:bg-primary')}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
          </div>
        </div>
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
            <DeckSection
              viewMode={viewMode}
              icon={<Swords className="h-3 w-3" />}
              label="Monsters"
              count={monsterCount}
              colorClass="text-orange-400"
              items={mainDeckMonsters}
              getMaxCopies={getMaxCopies}
              lastAddedCardId={lastAddedCardId}
              onDecrease={decreaseCard}
              onIncrease={(dc) => addCard(dc.card)}
            />
            <DeckSection
              viewMode={viewMode}
              icon={<Wand2 className="h-3 w-3" />}
              label="Spells"
              count={spellCount}
              colorClass="text-green-400"
              items={spells}
              getMaxCopies={getMaxCopies}
              lastAddedCardId={lastAddedCardId}
              onDecrease={decreaseCard}
              onIncrease={(dc) => addCard(dc.card)}
            />
            <DeckSection
              viewMode={viewMode}
              icon={<ShieldAlert className="h-3 w-3" />}
              label="Traps"
              count={trapCount}
              colorClass="text-purple-400"
              items={traps}
              getMaxCopies={getMaxCopies}
              lastAddedCardId={lastAddedCardId}
              onDecrease={decreaseCard}
              onIncrease={(dc) => addCard(dc.card)}
            />
            <DeckSection
              viewMode={viewMode}
              icon={<Layers className="h-3 w-3" />}
              label="Extra Deck"
              count={extraCount}
              colorClass="text-blue-400"
              items={extraDeck}
              getMaxCopies={getMaxCopies}
              lastAddedCardId={lastAddedCardId}
              onDecrease={decreaseCard}
              onIncrease={(dc) => addCard(dc.card)}
            />
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
