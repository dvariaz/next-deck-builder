import { cn } from '@/lib/utils'
import type { Attribute } from '@/modules/filters/utils/filterConstants'

const attributeIconFiles: Record<Attribute, string> = {
  DARK: 'dark_icon.svg',
  LIGHT: 'light_icon.svg',
  FIRE: 'fire_icon.svg',
  WATER: 'water_icon.svg',
  EARTH: 'earth_icon.svg',
  WIND: 'wind_icon.svg',
  DIVINE: 'divine_icon.svg',
}

interface AttributeIconProps {
  attribute: Attribute
  rounded?: boolean
  className?: string
}

// Icons are masked rather than colored via `fill` so they inherit `currentColor`
// from Tailwind text-color classes, matching the lucide icons they replaced.
export function AttributeIcon({ attribute, rounded = false, className }: AttributeIconProps) {
  const maskImage = `url(/icons/card-attributes/${attributeIconFiles[attribute]})`

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full',
        rounded && 'border border-current p-0.5',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="h-full w-full bg-current"
        style={{
          maskImage,
          maskSize: 'contain',
          maskRepeat: 'no-repeat',
          maskPosition: 'center',
          WebkitMaskImage: maskImage,
          WebkitMaskSize: 'contain',
          WebkitMaskRepeat: 'no-repeat',
          WebkitMaskPosition: 'center',
        }}
      />
    </span>
  )
}
