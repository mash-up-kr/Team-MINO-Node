import { describe, expect, it } from "bun:test";
import { lastValueFrom, of } from "rxjs";
import { PaginatedResult } from "./paginated-result";
import { ResponseInterceptor } from "./response.interceptor";

const interceptor = new ResponseInterceptor();

async function transform(data: unknown): Promise<unknown> {
  return lastValueFrom(
    interceptor.intercept({} as never, { handle: () => of(data) }),
  );
}

describe("ResponseInterceptor", () => {
  it("undefined는 그대로 통과시킨다", async () => {
    expect(await transform(undefined)).toBeUndefined();
  });

  it("일반 값은 { data }로 감싼다", async () => {
    expect(await transform({ value: 1 })).toEqual({ data: { value: 1 } });
  });

  it("PaginatedResult는 { data, pagination } 형태로 변환한다", async () => {
    const result = new PaginatedResult([1, 2], {
      pageSize: 20,
      page: 0,
      hasNext: false,
    });
    expect(await transform(result)).toEqual({
      data: [1, 2],
      pagination: { pageSize: 20, page: 0, hasNext: false },
    });
  });
});
