'use client';

import clsx from 'clsx';
import { ICard } from '@/modules/cards/types/card';
import CardItem from '@/modules/cards/components/CardItem';

interface IProps {
  selectedCardIds: number[];
  cards: ICard[];
  className?: string;
  onCardClick?: (card: ICard) => void;
  onCardMouseEnter?: (card: ICard) => void;
  onCardMouseLeave?: (card: ICard) => void;
}

const CardsGrid: React.FC<IProps> = ({ selectedCardIds, cards, className, onCardClick, onCardMouseEnter, onCardMouseLeave }) => {
  const handleClick = (card: ICard) => {
    if (!onCardClick) return;

    onCardClick(card)
  }

  const handleMouseEnter = (card: ICard) => {
    if (!onCardMouseEnter) return;

    onCardMouseEnter(card)
  }

  const handleMouseLeave = (card: ICard) => {
    if (!onCardMouseLeave) return;

    onCardMouseLeave(card)
  }

  return (
    <div className={clsx('grid grid-cols-8 gap-4 auto-rows-min', className)}>
      {
        cards.map(card => (
          <div key={card.id}>
            <CardItem
              card={card}
              selected={selectedCardIds.includes(card.id)}
              onClick={() => handleClick(card)}
              onMouseEnter={() => handleMouseEnter(card)}
              onMouseLeave={() => handleMouseLeave(card)}/>
          </div>
        ))
      }
    </div>
  )
}

export default CardsGrid;
