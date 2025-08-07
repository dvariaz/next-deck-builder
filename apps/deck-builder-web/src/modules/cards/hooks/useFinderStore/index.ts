import { create } from 'zustand';
import { createSelectors } from '@/modules/common/utils/store';
import { ICard } from '@/modules/cards/types/card';
import { IDeckItem } from '../../types/deck';

export interface IFinderStore {
  hoveredCard: ICard | null;
  selectedCards: ICard[];
  deckList: IDeckItem[];
  setHoveredCard: (card: ICard | null) => void;
  setSelectedCards: (card: ICard[]) => void;
  addCardToSelection: (card: ICard) => void;
  removeCardFromSelection: (card: ICard) => void;
}

export const useFinderStoreBase = create<IFinderStore>((set) => ({
  hoveredCard: null,
  selectedCards: [],
  deckList: [],
  setHoveredCard: (card) => set({ hoveredCard: card }),
  setSelectedCards: (cards) => set({ selectedCards: cards }),
  addCardToSelection: (card) => set((state) => ({
    selectedCards: [...state.selectedCards, card]
  })),
  removeCardFromSelection: (card) => set((state) => ({
    selectedCards: state.selectedCards.filter(c => c.id !== card.id)
  })),
}))

export const useFinderStore = createSelectors(useFinderStoreBase);
