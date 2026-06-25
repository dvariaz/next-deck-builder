import { describe, expect, it } from 'vitest'
import { formatCardTypeLabel } from './formatCardType'

describe('formatCardTypeLabel', () => {
  it('uses monsterEffectType as the prefix for monster cards', () => {
    expect(
      formatCardTypeLabel({ cardType: 'MONSTER', monsterEffectType: 'NORMAL' }),
    ).toBe('normal monster')
  })

  it('uses spellTrapSubType as the prefix for non-monster cards', () => {
    expect(
      formatCardTypeLabel({ cardType: 'SPELL', spellTrapSubType: 'QUICK_PLAY' }),
    ).toBe('quick play spell')
  })

  it('normalizes underscores to spaces and lowercases the result', () => {
    expect(
      formatCardTypeLabel({ cardType: 'TRAP', spellTrapSubType: 'CONTINUOUS' }),
    ).toBe('continuous trap')
  })

  it('ignores spellTrapSubType for monster cards', () => {
    expect(
      formatCardTypeLabel({
        cardType: 'MONSTER',
        monsterEffectType: 'EFFECT',
        spellTrapSubType: 'QUICK_PLAY',
      }),
    ).toBe('effect monster')
  })

  it('omits a missing prefix and returns just the card type', () => {
    expect(formatCardTypeLabel({ cardType: 'SPELL' })).toBe('spell')
    expect(formatCardTypeLabel({ cardType: 'MONSTER' })).toBe('monster')
  })
})
