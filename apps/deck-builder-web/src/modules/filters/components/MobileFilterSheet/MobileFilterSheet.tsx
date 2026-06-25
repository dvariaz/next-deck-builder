'use client'

import { SlidersHorizontal } from 'lucide-react'
import { Button } from '@/modules/common/components/Button/Button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/modules/common/components/Sheet/Sheet'
import { ScrollArea } from '@/modules/common/components/ScrollArea/ScrollArea'
import { FilterPanel } from '@/modules/filters/components/FilterPanel/FilterPanel'
import { useFilterStore } from '@/modules/filters/hooks/useFilterStore/useFilterStore'

export function MobileFilterSheet() {
  const getActiveFilterCount = useFilterStore.use.getActiveFilterCount()
  const clearAll = useFilterStore.use.clearAll()
  const count = getActiveFilterCount()

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 border-border bg-card hover:bg-muted lg:hidden">
          <SlidersHorizontal className="h-4 w-4" />
          <span>Filters</span>
          {count > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
              {count}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-full max-w-sm p-0">
        <SheetHeader className="border-b border-border p-4">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2">
              <SlidersHorizontal className="h-5 w-5 text-primary" />
              Filters
              {count > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/20 px-1.5 text-xs text-primary">
                  {count}
                </span>
              )}
            </SheetTitle>
            {count > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAll}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Clear all
              </Button>
            )}
          </div>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-80px)]">
          <div className="p-4">
            <FilterPanel />
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
