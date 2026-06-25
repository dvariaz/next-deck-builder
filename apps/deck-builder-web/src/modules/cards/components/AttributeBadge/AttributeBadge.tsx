import { Badge } from '@/modules/common/components/Badge/Badge'
import { cn } from '@/lib/utils'

const attributeColors: Record<string, string> = {
  DARK: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  LIGHT: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  FIRE: 'bg-red-500/20 text-red-300 border-red-500/30',
  WATER: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  EARTH: 'bg-amber-600/20 text-amber-400 border-amber-600/30',
  WIND: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  DIVINE: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
}

interface AttributeBadgeProps {
  attribute: string
}

export function AttributeBadge({ attribute }: AttributeBadgeProps) {
  return (
    <Badge variant="outline" className={cn('capitalize', attributeColors[attribute] ?? 'bg-muted/50')}>
      {attribute.toLowerCase()}
    </Badge>
  )
}
