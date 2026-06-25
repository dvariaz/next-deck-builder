import { Badge } from '@/modules/common/components/Badge/Badge'
import { cn } from '@/lib/utils'
import { formatCardTypeLabel } from '@/modules/cards/utils/formatCardType'
import type { CardResponseDtoCardType, CardResponseDtoMonsterEffectType, CardResponseDtoSpellTrapSubType } from '@/generated/model'

interface CardTypeBadgeProps {
  cardType: CardResponseDtoCardType
  spellTrapSubType?: CardResponseDtoSpellTrapSubType
  monsterEffectType?: CardResponseDtoMonsterEffectType
}

const cardTypeColors: Record<CardResponseDtoCardType, string> = {
  MONSTER: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  SPELL: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  TRAP: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
}

export function CardTypeBadge({ cardType, spellTrapSubType, monsterEffectType }: CardTypeBadgeProps) {
  return (
    <Badge variant="outline" className={cn('capitalize', cardTypeColors[cardType])}>
      {formatCardTypeLabel({ cardType, spellTrapSubType, monsterEffectType })}
    </Badge>
  )
}
