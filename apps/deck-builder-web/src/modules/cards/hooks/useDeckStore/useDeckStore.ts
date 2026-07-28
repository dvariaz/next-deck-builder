import { useEffect } from 'react'
import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { createSelectors } from '@/modules/common/utils/store'
import type { CardResponseDto, CardResponseDtoBanStatusTcg } from '@/generated/model'

export interface IDeckCard {
  card: CardResponseDto
  quantity: number
}

export interface DraftDeck {
  id: string
  name: string
  deckCards: IDeckCard[]
  createdAt: number
  updatedAt: number
}

interface DeckState {
  drafts: Record<string, DraftDeck>
  activeDraftId: string
  deckCards: IDeckCard[]
  totalCards: number
  lastAddedCardId: string | null

  addCard: (card: CardResponseDto) => { success: boolean; message: string }
  removeCard: (cardId: string) => void
  decreaseCard: (cardId: string) => void
  clearDeck: () => void
  getCardCount: (cardId: string) => number
  getTotalCards: () => number
  canAddCard: (card: CardResponseDto) => boolean
  getMaxCopies: (card: CardResponseDto) => number

  createDraft: (name?: string) => string
  switchDraft: (draftId: string) => void
  renameDraft: (draftId: string, name: string) => void
  deleteDraft: (draftId: string) => void
  listDrafts: () => DraftDeck[]
}

const PERSIST_NAME = 'deck-builder-drafts'
const PERSIST_VERSION = 1

function maxCopies(banStatus: CardResponseDtoBanStatusTcg | undefined): number {
  switch (banStatus) {
    case 'FORBIDDEN': return 0
    case 'LIMITED': return 1
    case 'SEMI_LIMITED': return 2
    default: return 3
  }
}

// crypto.randomUUID requires a secure context (HTTPS or localhost) — falls back
// to a non-cryptographic id so this still works over plain-HTTP LAN access (e.g. mobile testing).
function generateDraftId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function createEmptyDraft(name: string): DraftDeck {
  const now = Date.now()
  return {
    id: generateDraftId(),
    name,
    deckCards: [],
    createdAt: now,
    updatedAt: now,
  }
}

// Falls back to a no-op storage on the server, where `localStorage` doesn't exist.
const noopStorage: StateStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
}

const initialDraft = createEmptyDraft('Draft 1')

function sumQuantities(deckCards: IDeckCard[]): number {
  return deckCards.reduce((sum, dc) => sum + dc.quantity, 0)
}

// Replaces the active draft's cards in-place so `deckCards`/`totalCards` (kept for
// existing selectors/consumers) and the persisted `drafts` map never drift apart.
function withUpdatedDeck(state: DeckState, deckCards: IDeckCard[]): Pick<DeckState, 'deckCards' | 'totalCards' | 'drafts'> {
  const draft = state.drafts[state.activeDraftId]
  return {
    deckCards,
    totalCards: sumQuantities(deckCards),
    drafts: {
      ...state.drafts,
      [state.activeDraftId]: { ...draft, deckCards, updatedAt: Date.now() },
    },
  }
}

const useDeckStoreBase = create<DeckState>()(
  persist(
    (set, get) => ({
      drafts: { [initialDraft.id]: initialDraft },
      activeDraftId: initialDraft.id,
      deckCards: initialDraft.deckCards,
      totalCards: 0,
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
          return { ...withUpdatedDeck(s, updated), lastAddedCardId: card.id }
        })

        setTimeout(() => set({ lastAddedCardId: null }), 500)
        return { success: true, message: 'Card added to deck!' }
      },

      removeCard: (cardId) =>
        set((s) => withUpdatedDeck(s, s.deckCards.filter((dc) => dc.card.id !== cardId))),

      decreaseCard: (cardId) =>
        set((s) => {
          const idx = s.deckCards.findIndex((dc) => dc.card.id === cardId)
          if (idx < 0) return {}
          const current = s.deckCards[idx]
          if (current.quantity <= 1) {
            return withUpdatedDeck(s, s.deckCards.filter((dc) => dc.card.id !== cardId))
          }
          const updated = [...s.deckCards]
          updated[idx] = { ...updated[idx], quantity: updated[idx].quantity - 1 }
          return withUpdatedDeck(s, updated)
        }),

      clearDeck: () => set((s) => ({ ...withUpdatedDeck(s, []), lastAddedCardId: null })),

      getTotalCards: () => get().totalCards,

      createDraft: (name) => {
        const draft = createEmptyDraft(name?.trim() || `Draft ${Object.keys(get().drafts).length + 1}`)
        set((s) => ({
          drafts: { ...s.drafts, [draft.id]: draft },
          activeDraftId: draft.id,
          deckCards: draft.deckCards,
          totalCards: sumQuantities(draft.deckCards),
          lastAddedCardId: null,
        }))
        return draft.id
      },

      switchDraft: (draftId) => {
        const draft = get().drafts[draftId]
        if (!draft) return
        set({ activeDraftId: draftId, deckCards: draft.deckCards, totalCards: sumQuantities(draft.deckCards), lastAddedCardId: null })
      },

      renameDraft: (draftId, name) =>
        set((s) => {
          const draft = s.drafts[draftId]
          const trimmed = name.trim()
          if (!draft || !trimmed) return {}
          return { drafts: { ...s.drafts, [draftId]: { ...draft, name: trimmed, updatedAt: Date.now() } } }
        }),

      deleteDraft: (draftId) =>
        set((s) => {
          if (Object.keys(s.drafts).length <= 1) return {}
          const { [draftId]: _removed, ...rest } = s.drafts
          if (s.activeDraftId !== draftId) return { drafts: rest }
          const nextActiveId = Object.keys(rest)[0]
          return {
            drafts: rest,
            activeDraftId: nextActiveId,
            deckCards: rest[nextActiveId].deckCards,
            totalCards: sumQuantities(rest[nextActiveId].deckCards),
            lastAddedCardId: null,
          }
        }),

      listDrafts: () => Object.values(get().drafts).sort((a, b) => b.updatedAt - a.updatedAt),
    }),
    {
      name: PERSIST_NAME,
      version: PERSIST_VERSION,
      storage: createJSONStorage(() => (typeof window !== 'undefined' ? window.localStorage : noopStorage)),
      // Rehydration is triggered manually (see `useDeckStoreHydration`) so the first
      // client render matches the server-rendered (always-empty) markup and only
      // picks up localStorage after that initial paint, avoiding a hydration mismatch.
      skipHydration: true,
      partialize: (state) => ({ drafts: state.drafts, activeDraftId: state.activeDraftId }),
      merge: (persisted, current) => {
        const persistedState = persisted as Partial<Pick<DeckState, 'drafts' | 'activeDraftId'>> | undefined
        const hasDrafts = persistedState?.drafts && Object.keys(persistedState.drafts).length > 0
        const drafts = hasDrafts ? persistedState!.drafts! : current.drafts
        const activeDraftId = persistedState?.activeDraftId && drafts[persistedState.activeDraftId]
          ? persistedState.activeDraftId
          : Object.keys(drafts)[0]

        const deckCards = drafts[activeDraftId]?.deckCards ?? []
        return {
          ...current,
          drafts,
          activeDraftId,
          deckCards,
          totalCards: sumQuantities(deckCards),
        }
      },
      // No schema changes yet — bump PERSIST_VERSION and branch on `version` here
      // when the persisted shape needs to change in a future release.
      migrate: (persistedState) => persistedState as DeckState,
    },
  ),
)

export const useDeckStore = createSelectors(useDeckStoreBase)

// Call once near the app root. Rehydrates from localStorage after the first
// client render so it never runs during SSR/hydration.
export function useDeckStoreHydration() {
  useEffect(() => {
    void useDeckStoreBase.persist.rehydrate()
  }, [])
}
