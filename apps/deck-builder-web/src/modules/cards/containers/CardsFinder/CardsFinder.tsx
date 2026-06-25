'use client'

import { Sparkles } from 'lucide-react'
import { SearchBar } from '@/modules/filters/components/SearchBar/SearchBar'
import { FilterSidebar } from '@/modules/filters/components/FilterSidebar/FilterSidebar'
import { MobileFilterSheet } from '@/modules/filters/components/MobileFilterSheet/MobileFilterSheet'
import { SortControls } from '@/modules/filters/components/SortControls/SortControls'
import { ActiveFilters } from '@/modules/filters/components/ActiveFilters/ActiveFilters'
import { CardGrid } from '@/modules/cards/components/CardGrid/CardGrid'
import { DeckSidebar } from '@/modules/cards/components/DeckSidebar/DeckSidebar'
import { CardCountDisplay } from '@/modules/cards/components/CardCountDisplay/CardCountDisplay'
import { useFilterSync } from '@/modules/filters/hooks/useFilterSync/useFilterSync'

export function CardsFinder() {
  useFilterSync()

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
        <div className="flex h-16 items-center gap-4 px-4 lg:px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/20 neon-glow-cyan">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-lg font-bold text-foreground">
                YuGi<span className="text-primary">DB</span>
              </h1>
              <p className="text-xs text-muted-foreground">Card Database</p>
            </div>
          </div>

          <div className="flex-1 flex justify-center">
            <SearchBar />
          </div>

          <CardCountDisplay />
        </div>
      </header>

      <div className="flex">
        <FilterSidebar />

        <main className="flex-1 min-w-0">
          {/* Toolbar */}
          <div className="sticky top-16 z-30 border-b border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
            <div className="flex flex-col gap-3 p-4 lg:px-6">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <MobileFilterSheet />
                  <SortControls />
                </div>
              </div>
              <ActiveFilters />
            </div>
          </div>

          <div className="p-4 lg:p-6">
            <CardGrid />
          </div>
        </main>

        <DeckSidebar />
      </div>
    </div>
  )
}
