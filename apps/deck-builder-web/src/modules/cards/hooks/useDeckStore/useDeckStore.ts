import { create } from 'zustand'
import { createSelectors } from '@/modules/common/utils/store'
import type { CardResponseDto, CardResponseDtoBanStatusTcg } from '@/generated/model'

export interface IDeckCard {
  card: CardResponseDto
  quantity: number
}

interface DeckState {
  deckCards: IDeckCard[]
  lastAddedCardId: string | null

  addCard: (card: CardResponseDto) => { success: boolean; message: string }
  removeCard: (cardId: string) => void
  decreaseCard: (cardId: string) => void
  clearDeck: () => void
  getCardCount: (cardId: string) => number
  getTotalCards: () => number
  canAddCard: (card: CardResponseDto) => boolean
  getMaxCopies: (card: CardResponseDto) => number
}

function maxCopies(banStatus: CardResponseDtoBanStatusTcg | undefined): number {
  switch (banStatus) {
    case 'FORBIDDEN': return 0
    case 'LIMITED': return 1
    case 'SEMI_LIMITED': return 2
    default: return 3
  }
}

const useDeckStoreBase = create<DeckState>()((set, get) => ({
  deckCards: [],
  lastAddedCardId: null,

  getMaxCopies: (card) => maxCopies(card.banStatusTcg),

  getCardCount: (cardId) => {
    const entry = get().deckCards.find((dc) => dc.card.id === cardId)
    return entry?.quantity ?? 0
  },

  canAddCard: (card) => {
    const max = maxCopies(card.banStatusTcg)
    const current = get().getCardCount(card.id)
    return current < max
  },

  addCard: (card) => {
    const max = maxCopies(card.banStatusTcg)
    const current = get().getCardCount(card.id)

    if (max === 0) return { success: false, message: 'This card is Forbidden in TCG!' }
    if (current >= max) {
      const label = max === 1 ? 'Limited (1 copy)' : `Semi-Limited (${max} copies)`
      return { success: false, message: `Max copies reached: ${label}` }
    }

    set((s) => {
      const idx = s.deckCards.findIndex((dc) => dc.card.id === card.id)
      const updated = [...s.deckCards]
      if (idx >= 0) {
        updated[idx] = { ...updated[idx], quantity: updated[idx].quantity + 1 }
      } else {
        updated.push({ card, quantity: 1 })
      }
      return { deckCards: updated, lastAddedCardId: card.id }
    })

    setTimeout(() => set({ lastAddedCardId: null }), 500)
    return { success: true, message: 'Card added to deck!' }
  },

  removeCard: (cardId) =>
    set((s) => ({ deckCards: s.deckCards.filter((dc) => dc.card.id !== cardId) })),

  decreaseCard: (cardId) =>
    set((s) => {
      const idx = s.deckCards.findIndex((dc) => dc.card.id === cardId)
      if (idx < 0) return {}
      const current = s.deckCards[idx]
      if (current.quantity <= 1) {
        return { deckCards: s.deckCards.filter((dc) => dc.card.id !== cardId) }
      }
      const updated = [...s.deckCards]
      updated[idx] = { ...updated[idx], quantity: updated[idx].quantity - 1 }
      return { deckCards: updated }
    }),

  clearDeck: () => set({ deckCards: [], lastAddedCardId: null }),

  getTotalCards: () => get().deckCards.reduce((sum, dc) => sum + dc.quantity, 0),
}))

export const useDeckStore = createSelectors(useDeckStoreBase)
