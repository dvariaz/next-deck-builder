import CardsFinder from '@/modules/cards/containers/CardsFinder';
import { CardsRepository } from '@/modules/cards/repositories/CardsRepository';
import { ICardSearchQuery } from '@/modules/cards/repositories/CardsRepository/types';

interface IProps {
  searchParams: ICardSearchQuery;
}

const CardsPage: React.FC<IProps> = async ({ searchParams }) => {
  const data = await CardsRepository.search(await searchParams);

  return (
    <div className="bg-gradient-to-t from-[#1c1c2f] to-[#1f1f39] min-h-screen">
      <CardsFinder cards={data.results} />
    </div>
  )
}

export default CardsPage;