'use client'

import { Layers, Trash2, X } from 'lucide-react'
import { useDeckStore, useDeckStoreHydration } from '@/modules/cards/hooks/useDeckStore/useDeckStore'
import { DeckPanel } from '@/modules/cards/components/DeckPanel/DeckPanel'
import { Button } from '@/modules/common/components/Button/Button'
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/modules/common/components/Sheet/Sheet'

export function MobileDeckSheet() {
  useDeckStoreHydration()

  const clearDeck = useDeckStore.use.clearDeck()
  const totalCards = useDeckStore.use.totalCards()

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 border-border bg-card hover:bg-muted lg:hidden">
          <Layers className="h-4 w-4" />
          <span>Deck</span>
          {totalCards > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
              {totalCards}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full max-w-sm p-0 flex flex-col gap-0">
        <SheetHeader className="border-b border-border p-4">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary" />
              Deck Draft
              <span className="text-xs font-normal text-muted-foreground">{totalCards} cards</span>
            </SheetTitle>
            <div className="flex items-center gap-1">
              {totalCards > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearDeck}
                  className="text-xs text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
              <SheetClose asChild>
                <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                  <span className="sr-only">Close</span>
                </Button>
              </SheetClose>
            </div>
          </div>
        </SheetHeader>
        <DeckPanel />
      </SheetContent>
    </Sheet>
  )
}
