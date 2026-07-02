const ACTIVE_COLOR = '#e05252'
const INACTIVE_STROKE = '#aaa'
const STROKE_WIDTH = 3

const CARDINAL_ARROWS: { key: string; points: string }[] = [
  { key: 'top',    points: '50,5 35,22 65,22' },
  { key: 'right',  points: '95,50 78,35 78,65' },
  { key: 'bottom', points: '50,95 35,78 65,78' },
  { key: 'left',   points: '5,50 22,35 22,65' },
]

const DIAGONAL_ARROWS: { key: string; points: string }[] = [
  { key: 'top-left',     points: '5,5 30,5 5,30' },
  { key: 'top-right',    points: '95,5 70,5 95,30' },
  { key: 'bottom-right', points: '95,95 70,95 95,70' },
  { key: 'bottom-left',  points: '5,95 30,95 5,70' },
]

interface LinkLevelIconProps {
  linkMarkers: string[]
  size?: number
  className?: string
}

export function LinkLevelIcon({ linkMarkers, size = 40, className }: LinkLevelIconProps) {
  const active = new Set(linkMarkers.map((m) => m.toLowerCase()))

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      aria-label={`Link ${active.size}`}
    >
      {[...DIAGONAL_ARROWS, ...CARDINAL_ARROWS].map(({ key, points }) => (
        <polygon
          key={key}
          points={points}
          fill={active.has(key) ? ACTIVE_COLOR : 'none'}
          stroke={active.has(key) ? ACTIVE_COLOR : INACTIVE_STROKE}
          strokeWidth={STROKE_WIDTH}
          strokeLinejoin="miter"
        />
      ))}
    </svg>
  )
}
