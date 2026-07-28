'use client'

import { useState } from 'react'
import { Layers, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'
import { useDeckStore, useDeckStoreHydration } from '@/modules/cards/hooks/useDeckStore/useDeckStore'
import { DeckPanel } from '@/modules/cards/components/DeckPanel/DeckPanel'
import { Button } from '@/modules/common/components/Button/Button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/modules/common/components/Tooltip/Tooltip'

export function DeckSidebar() {
  useDeckStoreHydration()

  const [isCollapsed, setIsCollapsed] = useState(true)

  const clearDeck = useDeckStore.use.clearDeck()
  const totalCards = useDeckStore.use.totalCards()

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

      <DeckPanel />
    </aside>
  )
}
