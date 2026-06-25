'use client'

import { ArrowUp, ArrowDown } from 'lucide-react'
import { Button } from '@/modules/common/components/Button/Button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/common/components/Select/Select'
import { useFilterStore } from '@/modules/filters/hooks/useFilterStore/useFilterStore'
import type { SortField } from '@/modules/filters/hooks/useFilterStore/useFilterStore'

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'atk', label: 'ATK' },
  { value: 'def', label: 'DEF' },
  { value: 'level', label: 'Level' },
]

export function SortControls() {
  const sortField = useFilterStore.use.sortField()
  const sortDirection = useFilterStore.use.sortDirection()
  const setSort = useFilterStore.use.setSort()

  const handleFieldChange = (value: string) => {
    setSort(value as SortField, sortDirection)
  }

  const toggleDirection = () => {
    setSort(sortField, sortDirection === 'asc' ? 'desc' : 'asc')
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={sortField} onValueChange={handleFieldChange}>
        <SelectTrigger className="h-8 w-32 text-xs border-border bg-card hover:bg-muted">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SORT_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} className="text-xs">
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size="icon-sm"
        onClick={toggleDirection}
        className="border-border bg-card hover:bg-muted"
        aria-label={`Sort ${sortDirection === 'asc' ? 'ascending' : 'descending'}`}
      >
        {sortDirection === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
      </Button>
    </div>
  )
}
