'use client'

import { SlidersHorizontal } from 'lucide-react'
import { Button } from '@/modules/common/components/Button/Button'
import { ScrollArea } from '@/modules/common/components/ScrollArea/ScrollArea'
import { FilterPanel } from '@/modules/filters/components/FilterPanel/FilterPanel'
import { useFilterStore } from '@/modules/filters/hooks/useFilterStore/useFilterStore'

export function FilterSidebar() {
  const getActiveFilterCount = useFilterStore.use.getActiveFilterCount()
  const clearAll = useFilterStore.use.clearAll()
  const count = getActiveFilterCount()

  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-72 xl:w-80 border-r border-border bg-sidebar h-[calc(100vh-4rem)] sticky top-16">
      <div className="flex items-center justify-between border-b border-sidebar-border p-4">
        <h2 className="flex items-center gap-2 font-semibold text-sidebar-foreground">
          <SlidersHorizontal className="h-5 w-5 text-primary" />
          Filters
          {count > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/20 px-1.5 text-xs text-primary">
              {count}
            </span>
          )}
        </h2>
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
      <ScrollArea className="flex-1">
        <div className="p-4">
          <FilterPanel />
        </div>
      </ScrollArea>
    </aside>
  )
}
