import {
  LINK_ARROWS,
  ACTIVE_COLOR,
  INACTIVE_STROKE,
  STROKE_WIDTH,
} from './linkMarkerGeometry'

interface LinkLevelIconProps {
  linkMarkers: string[]
  size?: number
  className?: string
  activeColor?: string
}

export function LinkLevelIcon({ linkMarkers, size = 40, className, activeColor = ACTIVE_COLOR }: LinkLevelIconProps) {
  const active = new Set(linkMarkers.map((m) => m.toLowerCase()))

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      aria-label={`Link ${active.size}`}
    >
      {LINK_ARROWS.map(({ key, points }) => (
        <polygon
          key={key}
          points={points}
          fill={active.has(key) ? activeColor : 'none'}
          stroke={active.has(key) ? activeColor : INACTIVE_STROKE}
          strokeWidth={STROKE_WIDTH}
          strokeLinejoin="miter"
        />
      ))}
    </svg>
  )
}
