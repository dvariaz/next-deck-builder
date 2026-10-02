import type { EffectCost } from './card-effect.types';
import { unmaskBare } from './normalize';

/**
 * Stage 8 — costs.
 *
 * A cost is whatever precedes the PSCT semicolon: paid on activation, not
 * performed on resolution. Clause splitting has already isolated it, so this
 * only has to recognise the common shapes and keep the rest verbatim.
 *
 * This is what makes "Send 1 monster from your hand to the GY; Special Summon
 * 1 Level 1 monster" (One for One) record a cost rather than a second action.
 */

// "this card" is a count of one - "discard this card", "Tribute this card".
const COUNT = '(\\d+|a|an|this card|this monster)';

const DISCARD_RE = new RegExp(`\\bdiscard\\s+(?:${COUNT}\\b\\s*)?`, 'i');
const TRIBUTE_RE = new RegExp(`\\bTribute\\s+(?:${COUNT}\\b\\s*)?`, 'i');
const BANISH_RE = new RegExp(`\\bbanish\\s+(?:${COUNT}\\b\\s*)?`, 'i');
const PAY_LP_RE = /\bPay\s+([\d,]+)\s*(?:LP|Life Points)\b/i;

/**
 * The Xyz activation cost, on 294 cards. "Detach" is unambiguous — it applies
 * only to Xyz Materials — so it needs no guard beyond the count.
 */
const DETACH_RE = new RegExp(
  `\\bdetach\\s+(?:${COUNT}\\b\\s*)?(?:Xyz )?Materials?`,
  'i',
);

/** Deck thinning paid as a cost, rather than as part of the resolution. */
const SEND_DECK_RE = new RegExp(
  `\\bsend\\s+(?:${COUNT}\\b\\s*)?[^;.]*?from\\s+(?:the top of\\s+)?your\\s+Deck\\s+to\\s+the\\s+GY`,
  'i',
);

/**
 * A clause that only declares what the effect acts on.
 *
 * Targeting occupies the same slot as a cost in PSCT — "Target 1 monster in
 * either GY; Special Summon it" — but it is not a price paid, and the noun
 * phrase is already recorded on the action's `target`. Recording it as a cost
 * too would double-represent it and make Monster Reborn look like it costs
 * something.
 */
const SELECTION_ONLY_RE =
  /^\s*(?:you can\s+)?(?:target|choose|select)\b[^;]*$/i;

function toCount(raw?: string): number | 'ANY' {
  if (!raw) return 'ANY';
  if (/^(?:a|an|this card|this monster)$/i.test(raw)) return 1;
  const parsed = Number(raw.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 'ANY';
}

/** Parse the cost half of a PSCT clause. */
export function parseCost(
  costText: string | undefined,
  names: string[],
): EffectCost {
  const cost: EffectCost = {};
  if (!costText?.trim()) return cost;

  let recognised = false;

  // Order matters: a deck-send is a more specific shape than a bare banish or
  // discard, and must be checked before them so it is not double-counted.
  const sendDeck = SEND_DECK_RE.exec(costText);
  if (sendDeck) {
    cost.sendDeckToGy = toCount(sendDeck[1]);
    recognised = true;
  }

  const discard = DISCARD_RE.exec(costText);
  if (discard) {
    cost.discard = toCount(discard[1]);
    recognised = true;
  }

  const tribute = TRIBUTE_RE.exec(costText);
  if (tribute) {
    cost.tribute = toCount(tribute[1]);
    recognised = true;
  }

  if (!sendDeck) {
    const banish = BANISH_RE.exec(costText);
    if (banish) {
      cost.banish = toCount(banish[1]);
      recognised = true;
    }
  }

  const detach = DETACH_RE.exec(costText);
  if (detach) {
    cost.detach = toCount(detach[1]);
    recognised = true;
  }

  const lp = PAY_LP_RE.exec(costText);
  if (lp) {
    cost.payLifePoints = Number(lp[1].replace(/,/g, ''));
    recognised = true;
  }

  if (!recognised && !SELECTION_ONLY_RE.test(costText)) {
    // Keep it verbatim rather than dropping it: the UI shows costs on the edge,
    // and an unmodelled cost is still information the player needs.
    cost.other = [unmaskBare(costText, names).trim()];
  }

  return cost;
}

/** True when nothing was paid. */
export function isFreeCost(cost: EffectCost): boolean {
  return Object.keys(cost).length === 0;
}
