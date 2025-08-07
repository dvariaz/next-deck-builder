import clsx from 'clsx';
import { IDeckItem } from '@/modules/cards/types/deck';
import Counter from '@/modules/common/components/Counter';

interface IProps {
  card: IDeckItem;
  selected?: boolean;
  className?: string;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onDecrement?: () => void;
  onIncrement?: () => void;
}

const CardItem: React.FC<IProps> = ({
  card,
  selected = false,
  className,
  onClick,
  onMouseEnter,
  onMouseLeave,
  onDecrement,
  onIncrement,
}) => {
  return (
    <div className={clsx(className)}>
      <div className={clsx("p-2 border-2 hover:border-blue-400 relative", selected && "border-blue-400 p-0")}>
        <img
          src={card.cardImages[0].imageUrlSmall}
          alt={card.name}
          title={card.name}
          width={150}
          className={clsx("transition-transform duration-300", { "scale-70 -translate-y-3": selected })}
          onClick={onClick}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave} />

        { selected && (
          <div className='absolute left-0 bottom-2 w-full px-1'>
            <Counter value={0} onDecrement={onDecrement} onIncrement={onIncrement}/>
          </div>
        ) }
      </div>
    </div>
  )
}

export default CardItem;