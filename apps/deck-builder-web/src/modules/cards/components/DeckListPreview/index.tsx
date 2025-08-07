import { IDeckItem } from '@/modules/cards/types/deck'

interface IProps {
  cards: IDeckItem[];
}

const DeckListPreview = ({ cards }: IProps) => {
  return (
    <div className='grid grid-cols-3 gap-4 auto-rows-min'>
      {
        cards.map(cardItem => Array.from({ length: cardItem.count }, (_, index) => (
          <div key={`${cardItem.card.id}-${index}`} className='flex flex-col items-center'>
            <img
              src={cardItem.cardImages[0].imageUrlSmall}
              alt={cardItem.name}
              title={cardItem.name}
              width={150}
            />
          </div>
        )))
      }
    </div>
  )
}

export default DeckListPreview;
