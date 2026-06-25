import { describe, expect, it } from 'vitest'
import { makeCard } from '../test-utils/makeCard'
import { sortCards } from './sortCards'

describe('sortCards', () => {
  it('does not mutate the input array', () => {
    const cards = [makeCard({ name: 'B' }), makeCard({ name: 'A' })]
    const original = [...cards]

    sortCards(cards, 'name', 'asc')

    expect(cards).toEqual(original)
  })

  it('sorts by name ascending and descending', () => {
    const cards = [
      makeCard({ id: 'b', name: 'Beta' }),
      makeCard({ id: 'a', name: 'Alpha' }),
      makeCard({ id: 'c', name: 'Charlie' }),
    ]

    expect(sortCards(cards, 'name', 'asc').map((c) => c.id)).toEqual(['a', 'b', 'c'])
    expect(sortCards(cards, 'name', 'desc').map((c) => c.id)).toEqual(['c', 'b', 'a'])
  })

  it('sorts by atk and treats missing atk as -1', () => {
    const cards = [
      makeCard({ id: 'high', atk: 3000 }),
      makeCard({ id: 'none' }),
      makeCard({ id: 'zero', atk: 0 }),
    ]

    expect(sortCards(cards, 'atk', 'asc').map((c) => c.id)).toEqual(['none', 'zero', 'high'])
    expect(sortCards(cards, 'atk', 'desc').map((c) => c.id)).toEqual(['high', 'zero', 'none'])
  })

  it('sorts by def and treats missing def as -1', () => {
    const cards = [
      makeCard({ id: 'mid', def: 1500 }),
      makeCard({ id: 'none' }),
      makeCard({ id: 'zero', def: 0 }),
    ]

    expect(sortCards(cards, 'def', 'asc').map((c) => c.id)).toEqual(['none', 'zero', 'mid'])
  })

  it('sorts by level, falling back to linkVal then 0', () => {
    const cards = [
      makeCard({ id: 'level4', level: 4 }),
      makeCard({ id: 'link2', linkVal: 2 }),
      makeCard({ id: 'none' }),
    ]

    expect(sortCards(cards, 'level', 'asc').map((c) => c.id)).toEqual(['none', 'link2', 'level4'])
  })

  it('prefers level over linkVal when both are present', () => {
    const cards = [
      makeCard({ id: 'a', level: 1, linkVal: 8 }),
      makeCard({ id: 'b', level: 5, linkVal: 1 }),
    ]

    expect(sortCards(cards, 'level', 'asc').map((c) => c.id)).toEqual(['a', 'b'])
  })

  it('leaves the order unchanged for an unknown field', () => {
    const cards = [makeCard({ id: 'b' }), makeCard({ id: 'a' })]

    expect(sortCards(cards, 'unknown', 'asc').map((c) => c.id)).toEqual(['b', 'a'])
    expect(sortCards(cards, 'unknown', 'desc').map((c) => c.id)).toEqual(['b', 'a'])
  })

  it('returns an empty array unchanged', () => {
    expect(sortCards([], 'name', 'asc')).toEqual([])
  })
})
