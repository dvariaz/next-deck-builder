'use client'

import { Database } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useCardsInfinite } from '@/modules/cards/hooks/useCardsInfinite/useCardsInfinite'
import { useFilterStore } from '@/modules/filters/hooks/useFilterStore/useFilterStore'

export function CardCountDisplay() {
  const params = useFilterStore(useShallow((s) => s.toQueryParams()))
  const { total, isFetching } = useCardsInfinite(params)

  return (
    <div className="hidden md:flex items-center gap-2 text-sm">
      <Database className="h-4 w-4 text-muted-foreground" />
      <span className="text-muted-foreground">Database:</span>
      <span className="font-mono text-primary">
        {isFetching ? '…' : total.toLocaleString()}
      </span>
      <span className="text-muted-foreground">cards</span>
    </div>
  )
}
