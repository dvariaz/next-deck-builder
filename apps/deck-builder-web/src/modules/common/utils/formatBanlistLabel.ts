import type { CardsControllerFindAllBanStatusTcg } from '@/generated/model'

/**
 * Maps a banlist status to its human-readable, capitalized label, e.g.
 * `'SEMI_LIMITED'` -> "Semi-Limited".
 *
 * Statuses come back upper snake_cased from the API; this is the canonical
 * label used wherever a banlist status is rendered (badges, filters, icons).
 */
const BANLIST_LABELS: Record<CardsControllerFindAllBanStatusTcg, string> = {
  FORBIDDEN: 'Forbidden',
  LIMITED: 'Limited',
  SEMI_LIMITED: 'Semi-Limited',
  UNLIMITED: 'Unlimited',
}

export function formatBanlistLabel(status: CardsControllerFindAllBanStatusTcg): string {
  return BANLIST_LABELS[status]
}
