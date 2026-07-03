'use client'

import { useState } from 'react'
import { Link as LinkIcon, Unlink } from 'lucide-react'
import {
  LINK_ARROWS,
  ACTIVE_COLOR,
  INACTIVE_STROKE,
  STROKE_WIDTH,
} from '@/modules/cards/components/LinkLevelIcon/linkMarkerGeometry'
import { LINK_MARKER_LABELS, type LinkMarker } from '@/modules/filters/utils/filterConstants'
import { cn } from '@/lib/utils'

// Light translucent fill shown while hovering an unselected arrow.
const HOVER_FILL = 'rgba(224, 82, 82, 0.28)'

interface LinkMarkerSelectorProps {
  selected: string[]
  onToggle: (marker: string) => void
  strict: boolean
  onStrictChange: (val: boolean) => void
  size?: number
  className?: string
}

export function LinkMarkerSelector({
  selected,
  onToggle,
  strict,
  onStrictChange,
  size = 120,
  className,
}: LinkMarkerSelectorProps) {
  const active = new Set(selected)
  const [hovered, setHovered] = useState<string | null>(null)

  return (
    <div
      className={cn('relative inline-flex select-none', className)}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        role="group"
        aria-label="Link markers"
      >
        {LINK_ARROWS.map(({ key, points }) => {
          const isActive = active.has(key)
          const isHovered = hovered === key
          const fill = isActive ? ACTIVE_COLOR : isHovered ? HOVER_FILL : 'transparent'
          const stroke = isActive || isHovered ? ACTIVE_COLOR : INACTIVE_STROKE
          return (
            <polygon
              key={key}
              points={points}
              fill={fill}
              stroke={stroke}
              strokeWidth={STROKE_WIDTH}
              strokeLinejoin="miter"
              style={{ pointerEvents: 'all' }}
              className="cursor-pointer transition-colors focus:outline-none"
              role="button"
              tabIndex={0}
              aria-pressed={isActive}
              aria-label={LINK_MARKER_LABELS[key as LinkMarker] ?? key}
              onClick={() => onToggle(key)}
              onMouseEnter={() => setHovered(key)}
              onMouseLeave={() => setHovered((h) => (h === key ? null : h))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onToggle(key)
                }
              }}
            />
          )
        })}
      </svg>

      {/* Center strict toggle — overlay lets polygon clicks pass through. */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <button
          type="button"
          onClick={() => onStrictChange(!strict)}
          aria-pressed={strict}
          aria-label={strict ? 'Strict matching on' : 'Strict matching off'}
          title={strict ? 'Strict: exact markers only' : 'Loose: includes these markers'}
          className={cn(
            'pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            strict
              ? 'border-primary bg-primary/15 text-primary'
              : 'border-border bg-background text-muted-foreground hover:border-muted-foreground/60 hover:text-foreground',
          )}
        >
          {strict ? <LinkIcon className="h-4 w-4" /> : <Unlink className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}
