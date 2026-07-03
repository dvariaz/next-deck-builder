'use client'

import { X } from 'lucide-react'
import { Button } from '@/modules/common/components/Button/Button'
import { LinkLevelIcon } from '@/modules/cards/components/LinkLevelIcon/LinkLevelIcon'
import { formatBanlistLabel } from '@/modules/common/utils/formatBanlistLabel'
import { useFilterStore } from '@/modules/filters/hooks/useFilterStore/useFilterStore'
import { SPELL_TRAP_SUB_TYPE_LABELS } from '@/modules/filters/utils/filterConstants'
import { CardsControllerFindAllFrameTypeItem } from '@/generated/model'

function FilterChip({ label, value, capitalize, onRemove }: { label?: string; value: React.ReactNode; capitalize?: boolean; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
      {label && <span className="text-muted-foreground">{label}:</span>}
      <span className={capitalize ? 'capitalize' : undefined}>{value}</span>
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
  const races = useFilterStore.use.races()
  const spellTrapSubTypes = useFilterStore.use.spellTrapSubTypes()
  const banStatuses = useFilterStore.use.banStatuses()
  const levelMin = useFilterStore.use.levelMin()
  const levelMax = useFilterStore.use.levelMax()
  const atkMin = useFilterStore.use.atkMin()
  const atkMax = useFilterStore.use.atkMax()
  const defMin = useFilterStore.use.defMin()
  const defMax = useFilterStore.use.defMax()
  const isTuner = useFilterStore.use.isTuner()
  const isFlip = useFilterStore.use.isFlip()
  const isPendulum = useFilterStore.use.isPendulum()
  const linkMarkers = useFilterStore.use.linkMarkers()
  const linkMarkerStrict = useFilterStore.use.linkMarkerStrict()
  const removeFilter = useFilterStore.use.removeFilter()
  const clearAll = useFilterStore.use.clearAll()
  const getActiveFilterCount = useFilterStore.use.getActiveFilterCount()

  const count = getActiveFilterCount()
  if (count === 0) return null

  // Link monsters cap at Link 8, so mirror the slider's upper bound in the Level chip.
  const isLinkContext = linkMarkers.length > 0 || frameTypes.includes(CardsControllerFindAllFrameTypeItem.LINK)
  const levelUpperBound = isLinkContext ? 8 : 12

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">Active filters:</span>

      {search && (
        <FilterChip label="Search" value={`"${search}"`} onRemove={() => removeFilter('search')} />
      )}

      {cardTypes.map((type) => (
        <FilterChip key={type} label="Type" value={type.toLowerCase()} capitalize onRemove={() => removeFilter('cardType', type)} />
      ))}

      {frameTypes.map((type) => (
        <FilterChip key={type} label="Frame" value={type.toLowerCase()} capitalize onRemove={() => removeFilter('frameType', type)} />
      ))}

      {attributes.map((attr) => (
        <FilterChip key={attr} label="Attribute" value={attr} onRemove={() => removeFilter('attribute', attr)} />
      ))}

      {races.map((race) => (
        <FilterChip key={race} label="Race" value={race} onRemove={() => removeFilter('race', race)} />
      ))}

      {spellTrapSubTypes.map((type) => (
        <FilterChip key={type} label="Sub-Type" value={SPELL_TRAP_SUB_TYPE_LABELS[type]} onRemove={() => removeFilter('spellTrapSubType', type)} />
      ))}

      {banStatuses.map((status) => (
        <FilterChip key={status} label="Banlist" value={formatBanlistLabel(status)} onRemove={() => removeFilter('banStatus', status)} />
      ))}

      {(levelMin !== undefined || levelMax !== undefined) && !(linkMarkers.length > 0 && linkMarkerStrict) && (
        <FilterChip
          label="Level"
          value={`${levelMin ?? 1}–${levelMax ?? levelUpperBound}`}
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

      {isTuner && (
        <FilterChip label="Property" value="Tuner" onRemove={() => removeFilter('isTuner')} />
      )}

      {isFlip && (
        <FilterChip label="Property" value="Flip" onRemove={() => removeFilter('isFlip')} />
      )}

      {isPendulum && (
        <FilterChip label="Property" value="Pendulum" onRemove={() => removeFilter('isPendulum')} />
      )}

      {linkMarkers.length > 0 && (
        <FilterChip
          value={
            <span className="inline-flex items-center gap-1">
              <LinkLevelIcon linkMarkers={linkMarkers} size={14} />
              {`Link ${linkMarkerStrict ? linkMarkers.length : `${linkMarkers.length}+`}`}
            </span>
          }
          onRemove={() => removeFilter('linkMarkers')}
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
