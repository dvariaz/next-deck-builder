'use client';

import CardsGrid from '@/modules/cards/components/CardsGrid/index';
import CardPreview from '@/modules/cards/components/CardPreview';
import { ICard } from '@/modules/cards/types/card';
import SearchInput from '@/modules/cards/components/SearchInput';
import { useFinderStore } from '@/modules/cards/hooks/useFinderStore';
import DeckListPreview from '@/modules/cards/components/DeckListPreview';

interface IProps {
  cards: ICard[];
}

const CardsFinder: React.FC<IProps> = ({ cards }) => {
  const selectedCards = useFinderStore.use.selectedCards()
  const hoveredCard = useFinderStore.use.hoveredCard()
  const decklist = useFinderStore.use.deckList()
  const setHoveredCard = useFinderStore.use.setHoveredCard()
  const addCardToSelection = useFinderStore.use.addCardToSelection()
  const removeCardFromSelection = useFinderStore.use.removeCardFromSelection()

  const handleCardClick = (card: ICard) => {
    if (selectedCards.find(c => c.id === card.id)) {
      removeCardFromSelection(card)
      return
    }

    addCardToSelection(card)
  }

  return (
    <div className='flex h-screen'>
      <CardPreview card={hoveredCard} className="w-md p-8"/>
      
      <div className='flex flex-col max-w-5xl h-full'>
        <SearchInput className="my-8 w-full" />

        <CardsGrid
          selectedCardIds={selectedCards.map(c => c.id)}
          cards={cards}
          onCardClick={handleCardClick}
          onCardMouseEnter={setHoveredCard}
          onCardMouseLeave={() => setHoveredCard(null)}
          className='flex-1 overflow-y-scroll' />
      </div>

      <div className='flex flex-col w-96'>
        <DeckListPreview cards={decklist} />
      </div>
    </div>
  )
}

export default CardsFinder;
