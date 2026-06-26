'use client'

import { useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { useFilterStore } from '@/modules/filters/hooks/useFilterStore/useFilterStore'
import { cn } from '@/lib/utils'

export function SearchBar() {
  const search = useFilterStore.use.search()
  const updateSearch = useFilterStore.use.updateSearch()
  const [isFocused, setIsFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleClear = () => {
    updateSearch('')
    inputRef.current?.focus()
  }

  return (
    <div className="relative w-full max-w-2xl">
      <div
        className={cn(
          'relative flex items-center rounded-lg border bg-card transition-all duration-200',
          isFocused
            ? 'border-primary ring-2 ring-primary/20 neon-glow-cyan'
            : 'border-border hover:border-muted-foreground/50',
        )}
      >
        <Search className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          placeholder="Search cards by name or description..."
          value={search}
          onChange={(e) => updateSearch(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          className="w-full bg-transparent py-2 pl-10 pr-10 text-sm text-foreground placeholder:text-muted-foreground outline-none"
          aria-label="Search cards"
        />
        {search && (
          <button
            onClick={handleClear}
            className="absolute right-3 rounded-sm p-0.5 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}
