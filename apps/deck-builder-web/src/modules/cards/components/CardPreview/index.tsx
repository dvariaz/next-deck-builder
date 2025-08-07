import clsx from 'clsx';
import { ICard } from '@/modules/cards/types/card';

interface IProps {
  card: ICard | null;
  className?: string;
}

const CardPreview: React.FC<IProps> = ({ card, className }) => {
  if (!card) {
    return (
      <div className={clsx('flex flex-col items-center', className)}>
        <div>
          <h2>Select a card</h2>
        </div>
      </div>
    )
  }

  return (
    <div className={clsx('flex flex-col items-center', className)}>
      <img
        src={card.cardImages[0].imageUrl}
        alt={card.name} />
    </div>
  )
}

export default CardPreview;
