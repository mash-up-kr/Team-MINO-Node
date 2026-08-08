/** 목록 API 공통 페이지네이션 메타 (offset 기반). */
export type Pagination = {
  pageSize: number;
  page: number;
  hasNext: boolean;
};

/**
 * 페이지네이션 목록 응답. `data` 형제 필드로 `pagination`을 내리는 계약이라
 * 공통 ResponseInterceptor가 이 형태는 다시 감싸지 않는다.
 * `pagination`이 없으면 전체 조회 응답이다.
 */
export type PaginatedResponse<T> = {
  data: T[];
  pagination?: Pagination;
};
