'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'

interface HeroCardWallProps {
  /** Small card-art image URLs (newest first). */
  images: string[]
}

const COLUMN_COUNT = 7

// Per-column tuning: scroll direction, speed, and how far down each starts.
// Odd columns drift downward for a subtle counter-parallax feel.
const COLUMN_META = Array.from({ length: COLUMN_COUNT }, (_, i) => ({
  direction: i % 2 === 0 ? 'up' : 'down',
  duration: 55 + (i % 4) * 12, // 55s..91s
  // Hide extra columns on smaller screens to keep the wall breathable.
  responsive:
    i < 3 ? '' : i < 5 ? 'hidden sm:flex' : 'hidden lg:flex',
})) as { direction: 'up' | 'down'; duration: number; responsive: string }[]

export function HeroCardWall({ images }: HeroCardWallProps) {
  const columns = useMemo(() => {
    if (images.length === 0) return []
    // Round-robin distribute images across columns for visual variety.
    const cols: string[][] = Array.from({ length: COLUMN_COUNT }, () => [])
    images.forEach((src, i) => cols[i % COLUMN_COUNT].push(src))
    // Guarantee each column has enough cards to fill the viewport height.
    return cols.map((col) => (col.length >= 4 ? col : [...col, ...col, ...col].slice(0, 4)))
  }, [images])

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* Starfield base — always present, and the sole background when the API is down. */}
      <div className="bg-star-mosaic absolute inset-0 opacity-40" />

      {columns.length > 0 && (
        <div className="absolute inset-0 flex justify-center gap-3 px-2 opacity-55 sm:gap-4">
          {columns.map((col, colIndex) => {
            const meta = COLUMN_META[colIndex]
            return (
              <div
                key={colIndex}
                className={cn(
                  'flex w-24 shrink-0 flex-col sm:w-28 lg:w-32',
                  meta.responsive,
                )}
              >
                <div
                  className={cn(
                    'flex flex-col gap-3 sm:gap-4',
                    meta.direction === 'up' ? 'animate-marquee-up' : 'animate-marquee-down',
                  )}
                  style={{ '--marquee-duration': `${meta.duration}s` } as React.CSSProperties}
                >
                  {/* Duplicate the list so the -50% loop is seamless. */}
                  {[...col, ...col].map((src, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={`${colIndex}-${i}`}
                      src={src}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="aspect-421/614 w-full rounded-md object-cover shadow-lg shadow-black/40"
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Legibility scrim: cards stay visible in the middle band; fade into the
          nav at the top and the next section at the bottom. */}
      <div className="absolute inset-0 bg-linear-to-b from-background via-transparent to-background" />
      {/* Soft dark halo directly behind the headline only. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 60% 55% at 50% 50%, color-mix(in oklch, var(--background) 78%, transparent) 0%, transparent 72%)',
        }}
      />
      {/* Neon aura bloom behind the headline */}
      <div className="animate-aura absolute left-1/2 top-1/2 h-152 w-152 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/15 blur-[120px]" />
    </div>
  )
}
