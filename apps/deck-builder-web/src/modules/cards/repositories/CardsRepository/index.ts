import { objectToCamel } from 'ts-case-convert';
import SearchQueryBuilder from '@/modules/common/builders/SearchQueryBuilder';
import { ICardsApiResponse, ICardSearchQuery, ICardsSearchResponse } from './types';

export class CardsRepository {
  static async search(query: ICardSearchQuery = { q: '', offset: 0, limit: 60 }): Promise<ICardsSearchResponse> {
    try {
      const searchQueryBuilder = new SearchQueryBuilder(query);
      const queryString = searchQueryBuilder.queryParamsString;
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/cards?${queryString}`, {
        next: {
          tags: [
            'cards',
            queryString
          ]
        }
      });
      const data = await response.json() as ICardsApiResponse;
      const camelizedData = objectToCamel(data);

      return camelizedData;
    } catch (err: unknown) {
      console.error(err);
      throw Error('Internal Service Error');
    }
  }
}
