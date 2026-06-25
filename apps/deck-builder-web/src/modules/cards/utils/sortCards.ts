import type { CardResponseDto } from '@/generated/model'

/**
 * Returns a new array of cards sorted by the given field and direction.
 *
 * Supported fields are `name`, `atk`, `def`, and `level`. Missing numeric
 * values are treated as `-1` for atk/def and `0` for level, with link monsters
 * falling back to `linkVal`. Unknown fields leave the order unchanged. The
 * input array is not mutated.
 */
export function sortCards(
  cards: CardResponseDto[],
  field: string,
  direction: string,
): CardResponseDto[] {
  return [...cards].sort((a, b) => {
    let cmp = 0
    switch (field) {
      case 'name':
        cmp = a.name.localeCompare(b.name)
        break
      case 'atk':
        cmp = (a.atk ?? -1) - (b.atk ?? -1)
        break
      case 'def':
        cmp = (a.def ?? -1) - (b.def ?? -1)
        break
      case 'level':
        cmp = (a.level ?? a.linkVal ?? 0) - (b.level ?? b.linkVal ?? 0)
        break
    }
    return direction === 'asc' ? cmp : -cmp
  })
}
