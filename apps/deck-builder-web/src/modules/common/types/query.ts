export interface IBasePaginatedQuery {
  offset: number;
  limit: number;
}

export interface IPaginationData extends IBasePaginatedQuery {
  total: number;
}
