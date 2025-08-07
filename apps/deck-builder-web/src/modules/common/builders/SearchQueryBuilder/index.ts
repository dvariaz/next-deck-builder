import { IBasePaginatedQuery } from '@/modules/common/types/query';

export default class SearchQueryBuilder {
  private raw: IBasePaginatedQuery;
  public searchParams: URLSearchParams;

  constructor (payload: IBasePaginatedQuery) {
    this.raw = payload;
    
    const { offset = '0', limit = '60', ...rest } = payload;

    const urlSearchParams = new URLSearchParams();

    Object.entries({ offset, limit, ...rest }).forEach(([key, value]) => {
      urlSearchParams.append(key, value.toString());
    })

    this.searchParams = urlSearchParams;
  }

  public get queryParamsString () {
    return this.searchParams.toString();
  }
}
