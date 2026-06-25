'use client'

import { X } from 'lucide-react'
import { Button } from '@/modules/common/components/Button/Button'
import { useFilterStore } from '@/modules/filters/hooks/useFilterStore/useFilterStore'

function FilterChip({ label, value, onRemove }: { label: string; value: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
      <span className="text-muted-foreground">{label}:</span>
      {value}
      <button
        onClick={onRemove}
        className="ml-0.5 rounded-full p-0.5 hover:bg-muted transition-colors"
        aria-label={`Remove ${label} filter`}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  )
}

export function ActiveFilters() {
  const search = useFilterStore.use.search()
  const cardTypes = useFilterStore.use.cardTypes()
  const frameTypes = useFilterStore.use.frameTypes()
  const attributes = useFilterStore.use.attributes()
  const banStatus = useFilterStore.use.banStatus()
  const levelMin = useFilterStore.use.levelMin()
  const levelMax = useFilterStore.use.levelMax()
  const atkMin = useFilterStore.use.atkMin()
  const atkMax = useFilterStore.use.atkMax()
  const defMin = useFilterStore.use.defMin()
  const defMax = useFilterStore.use.defMax()
  const removeFilter = useFilterStore.use.removeFilter()
  const clearAll = useFilterStore.use.clearAll()
  const getActiveFilterCount = useFilterStore.use.getActiveFilterCount()

  const count = getActiveFilterCount()
  if (count === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">Active filters:</span>

      {search && (
        <FilterChip label="Search" value={`"${search}"`} onRemove={() => removeFilter('search')} />
      )}

      {cardTypes.map((type) => (
        <FilterChip key={type} label="Type" value={type} onRemove={() => removeFilter('cardType', type)} />
      ))}

      {frameTypes.map((type) => (
        <FilterChip key={type} label="Frame" value={type} onRemove={() => removeFilter('frameType', type)} />
      ))}

      {attributes.map((attr) => (
        <FilterChip key={attr} label="Attribute" value={attr} onRemove={() => removeFilter('attribute', attr)} />
      ))}

      {banStatus && (
        <FilterChip label="Banlist" value={banStatus} onRemove={() => removeFilter('banStatus')} />
      )}

      {(levelMin !== undefined || levelMax !== undefined) && (
        <FilterChip
          label="Level"
          value={`${levelMin ?? 1}–${levelMax ?? 12}`}
          onRemove={() => removeFilter('levelRange')}
        />
      )}

      {(atkMin !== undefined || atkMax !== undefined) && (
        <FilterChip
          label="ATK"
          value={`${atkMin ?? 0}–${atkMax ?? 5000}`}
          onRemove={() => removeFilter('atkRange')}
        />
      )}

      {(defMin !== undefined || defMax !== undefined) && (
        <FilterChip
          label="DEF"
          value={`${defMin ?? 0}–${defMax ?? 5000}`}
          onRemove={() => removeFilter('defRange')}
        />
      )}

      <Button
        variant="ghost"
        size="sm"
        onClick={clearAll}
        className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <X className="h-3 w-3" />
        Clear all
      </Button>
    </div>
  )
}
