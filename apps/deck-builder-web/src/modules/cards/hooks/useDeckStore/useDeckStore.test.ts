import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeCard } from '../../test-utils/makeCard'
import { useDeckStore } from './useDeckStore'

const store = () => useDeckStore.getState()

beforeEach(() => {
  localStorage.clear()
  const draftId = crypto.randomUUID()
  useDeckStore.setState({
    drafts: { [draftId]: { id: draftId, name: 'Draft 1', deckCards: [], createdAt: Date.now(), updatedAt: Date.now() } },
    activeDraftId: draftId,
    deckCards: [],
    totalCards: 0,
    lastAddedCardId: null,
  })
})

describe('useDeckStore', () => {
  describe('getMaxCopies', () => {
    it('maps ban status to the allowed number of copies', () => {
      expect(store().getMaxCopies(makeCard({ banStatusTcg: 'FORBIDDEN' }))).toBe(0)
      expect(store().getMaxCopies(makeCard({ banStatusTcg: 'LIMITED' }))).toBe(1)
      expect(store().getMaxCopies(makeCard({ banStatusTcg: 'SEMI_LIMITED' }))).toBe(2)
      expect(store().getMaxCopies(makeCard({ banStatusTcg: 'UNLIMITED' }))).toBe(3)
    })

    it('defaults to 3 copies when ban status is missing', () => {
      expect(store().getMaxCopies(makeCard())).toBe(3)
    })
  })

  describe('addCard', () => {
    it('adds a new card with quantity 1 and tracks it as last added', () => {
      const card = makeCard({ id: 'a' })

      const result = store().addCard(card)

      expect(result).toEqual({ success: true, message: 'Card added to deck!' })
      expect(store().deckCards).toEqual([{ card, quantity: 1 }])
      expect(store().lastAddedCardId).toBe('a')
    })

    it('increments quantity when the same card is added again', () => {
      const card = makeCard({ id: 'a' })

      store().addCard(card)
      store().addCard(card)

      expect(store().deckCards).toEqual([{ card, quantity: 2 }])
    })

    it('refuses to add a forbidden card', () => {
      const card = makeCard({ id: 'a', banStatusTcg: 'FORBIDDEN' })

      const result = store().addCard(card)

      expect(result).toEqual({ success: false, message: 'This card is Forbidden in TCG!' })
      expect(store().deckCards).toEqual([])
    })

    it('reports the limit when a limited card is maxed out', () => {
      const card = makeCard({ id: 'a', banStatusTcg: 'LIMITED' })

      store().addCard(card)
      const result = store().addCard(card)

      expect(result).toEqual({ success: false, message: 'Max copies reached: Limited (1 copy)' })
      expect(store().getCardCount('a')).toBe(1)
    })

    it('reports the limit when a semi-limited card is maxed out', () => {
      const card = makeCard({ id: 'a', banStatusTcg: 'SEMI_LIMITED' })

      store().addCard(card)
      store().addCard(card)
      const result = store().addCard(card)

      expect(result).toEqual({
        success: false,
        message: 'Max copies reached: Semi-Limited (2 copies)',
      })
      expect(store().getCardCount('a')).toBe(2)
    })

    it('clears lastAddedCardId after 500ms', () => {
      vi.useFakeTimers()
      try {
        store().addCard(makeCard({ id: 'a' }))
        expect(store().lastAddedCardId).toBe('a')

        vi.advanceTimersByTime(500)
        expect(store().lastAddedCardId).toBeNull()
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('removeCard', () => {
    it('removes the card entirely regardless of quantity', () => {
      const card = makeCard({ id: 'a' })
      store().addCard(card)
      store().addCard(card)

      store().removeCard('a')

      expect(store().deckCards).toEqual([])
    })

    it('does nothing for an unknown card id', () => {
      store().addCard(makeCard({ id: 'a' }))

      store().removeCard('missing')

      expect(store().getCardCount('a')).toBe(1)
    })
  })

  describe('decreaseCard', () => {
    it('decrements quantity when more than one copy exists', () => {
      const card = makeCard({ id: 'a' })
      store().addCard(card)
      store().addCard(card)

      store().decreaseCard('a')

      expect(store().getCardCount('a')).toBe(1)
    })

    it('removes the card when the last copy is decreased', () => {
      store().addCard(makeCard({ id: 'a' }))

      store().decreaseCard('a')

      expect(store().deckCards).toEqual([])
    })

    it('does nothing for an unknown card id', () => {
      store().addCard(makeCard({ id: 'a' }))

      store().decreaseCard('missing')

      expect(store().getCardCount('a')).toBe(1)
    })
  })

  describe('canAddCard', () => {
    it('returns true while below the max and false once reached', () => {
      const card = makeCard({ id: 'a', banStatusTcg: 'LIMITED' })

      expect(store().canAddCard(card)).toBe(true)
      store().addCard(card)
      expect(store().canAddCard(card)).toBe(false)
    })

    it('returns false for a forbidden card', () => {
      expect(store().canAddCard(makeCard({ banStatusTcg: 'FORBIDDEN' }))).toBe(false)
    })
  })

  describe('getCardCount / getTotalCards', () => {
    it('returns 0 for a card not in the deck', () => {
      expect(store().getCardCount('missing')).toBe(0)
    })

    it('sums quantities across all deck cards', () => {
      const a = makeCard({ id: 'a' })
      const b = makeCard({ id: 'b' })
      store().addCard(a)
      store().addCard(a)
      store().addCard(b)

      expect(store().getTotalCards()).toBe(3)
    })
  })

  describe('clearDeck', () => {
    it('empties the deck and resets lastAddedCardId', () => {
      store().addCard(makeCard({ id: 'a' }))

      store().clearDeck()

      expect(store().deckCards).toEqual([])
      expect(store().lastAddedCardId).toBeNull()
    })
  })

  describe('drafts', () => {
    it('persists the active draft to localStorage on every mutation', () => {
      store().addCard(makeCard({ id: 'a' }))

      const raw = localStorage.getItem('deck-builder-drafts')
      expect(raw).not.toBeNull()

      const persisted = JSON.parse(raw!)
      expect(persisted.version).toBe(1)
      const activeDraftId = persisted.state.activeDraftId
      expect(persisted.state.drafts[activeDraftId].deckCards).toEqual([
        { card: makeCard({ id: 'a' }), quantity: 1 },
      ])
    })

    it('createDraft starts a new empty draft and makes it active', () => {
      store().addCard(makeCard({ id: 'a' }))
      const previousDraftId = store().activeDraftId

      const newDraftId = store().createDraft('Burn Deck')

      expect(newDraftId).not.toBe(previousDraftId)
      expect(store().activeDraftId).toBe(newDraftId)
      expect(store().deckCards).toEqual([])
      expect(store().drafts[previousDraftId].deckCards).toHaveLength(1)
      expect(store().drafts[newDraftId].name).toBe('Burn Deck')
    })

    it('switchDraft restores the target draft as the working deck', () => {
      store().addCard(makeCard({ id: 'a' }))
      const firstDraftId = store().activeDraftId
      store().createDraft('Second Draft')
      store().addCard(makeCard({ id: 'b' }))

      store().switchDraft(firstDraftId)

      expect(store().activeDraftId).toBe(firstDraftId)
      expect(store().deckCards).toEqual([{ card: makeCard({ id: 'a' }), quantity: 1 }])
    })

    it('renameDraft updates the draft name', () => {
      const draftId = store().activeDraftId

      store().renameDraft(draftId, 'Control Deck')

      expect(store().drafts[draftId].name).toBe('Control Deck')
    })

    it('renameDraft ignores blank names', () => {
      const draftId = store().activeDraftId
      const originalName = store().drafts[draftId].name

      store().renameDraft(draftId, '   ')

      expect(store().drafts[draftId].name).toBe(originalName)
    })

    it('deleteDraft removes a non-active draft', () => {
      const firstDraftId = store().activeDraftId
      const secondDraftId = store().createDraft('Second Draft')
      store().switchDraft(firstDraftId)

      store().deleteDraft(secondDraftId)

      expect(store().drafts[secondDraftId]).toBeUndefined()
      expect(store().activeDraftId).toBe(firstDraftId)
    })

    it('deleteDraft falls back to another draft when deleting the active one', () => {
      const firstDraftId = store().activeDraftId
      store().addCard(makeCard({ id: 'a' }))
      const secondDraftId = store().createDraft('Second Draft')

      store().deleteDraft(secondDraftId)

      expect(store().activeDraftId).toBe(firstDraftId)
      expect(store().deckCards).toEqual([{ card: makeCard({ id: 'a' }), quantity: 1 }])
    })

    it('deleteDraft refuses to remove the last remaining draft', () => {
      const draftId = store().activeDraftId

      store().deleteDraft(draftId)

      expect(store().drafts[draftId]).toBeDefined()
      expect(Object.keys(store().drafts)).toHaveLength(1)
    })

    it('listDrafts returns drafts ordered by most recently updated', () => {
      vi.useFakeTimers()
      try {
        store().renameDraft(store().activeDraftId, 'Oldest')
        vi.advanceTimersByTime(1000)
        const newerDraftId = store().createDraft('Newer')

        const drafts = store().listDrafts()

        expect(drafts[0].id).toBe(newerDraftId)
      } finally {
        vi.useRealTimers()
      }
    })
  })
})

afterEach(() => {
  vi.useRealTimers()
})
