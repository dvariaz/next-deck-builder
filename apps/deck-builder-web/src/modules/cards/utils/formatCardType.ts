import type { CardResponseDto } from '@/generated/model'

/**
 * Builds a human-readable label for a card, e.g.
 * `{ cardType: 'SPELL', spellTrapSubType: 'QUICK_PLAY' }` -> "quick play spell"
 * `{ cardType: 'MONSTER', monsterEffectType: 'NORMAL' }` -> "normal monster".
 *
 * For monster cards the prefix comes from `monsterEffectType`, otherwise from
 * `spellTrapSubType`. Both come back snake_cased from the API, so underscores
 * are normalized to spaces. The returned string is lowercased and intended to
 * be displayed with a `capitalize` style.
 */
export function formatCardTypeLabel(
  card: Pick<CardResponseDto, 'cardType' | 'spellTrapSubType' | 'monsterEffectType'>,
): string {
  const prefix = card.cardType === 'MONSTER' ? card.monsterEffectType : card.spellTrapSubType

  return [prefix, card.cardType]
    .filter(Boolean)
    .map(part => part!.replace(/_/g, ' ').toLowerCase())
    .join(' ')
}
