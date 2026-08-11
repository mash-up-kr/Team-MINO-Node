export interface Pagination {
  readonly pageSize: number;
  readonly page: number;
  readonly hasNext: boolean;
}

export class PaginatedResult<T> {
  constructor(
    readonly data: T[],
    readonly pagination: Pagination,
  ) {}
}
