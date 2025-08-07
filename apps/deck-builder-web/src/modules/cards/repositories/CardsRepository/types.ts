import { SnakeCasedProperties } from 'type-fest';

import { IBasePaginatedQuery, IPaginationData } from '@/modules/common/types/query';
import { ICard } from '@/modules/cards/types/card';

export type ICardsApiResponse = {
  results: SnakeCasedProperties<ICard>[];
  pagination: IPaginationData;
};

export interface ICardsSearchResponse {
  results: ICard[];
  pagination: IPaginationData;
}

export interface ICardSearchQuery extends IBasePaginatedQuery {
  q: string;
}
