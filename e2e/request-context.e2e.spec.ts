import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
  Controller,
  Get,
  type INestApplication,
  type MiddlewareConsumer,
  Module,
  type NestModule,
  RequestMethod,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { BunHonoAdapter } from "../src/adapters/bun-hono.adapter";
import {
  REQUEST_ID_HEADER,
  RequestContext,
} from "../src/common/context/request-context";
import { LoggingMiddleware } from "../src/common/middlewares/logging.middleware";

/*
 * AsyncLocalStorage가 어댑터 경계를 넘는지는 실제 어댑터로만 확인된다. 유닛 테스트는
 * next()를 RequestContext.run 안에서 직접 부르므로 경계를 넘지 않아 항상 통과한다.
 *
 * 전파가 끊겨도 예외가 아니라 로그에서 requestId가 조용히 사라질 뿐이라 운영에서
 * 알아채기 어렵다. 그래서 여기서 막는다.
 */

@Controller()
class ContextProbeController {
  @Get("/ctx")
  read() {
    return { requestId: RequestContext.getRequestId() ?? null };
  }

  @Get("/ctx-async")
  async readAfterAwait() {
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { requestId: RequestContext.getRequestId() ?? null };
  }
}

@Module({ controllers: [ContextProbeController] })
class ContextProbeModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(LoggingMiddleware)
      .forRoutes({ path: "*", method: RequestMethod.ALL });
  }
}

let app: INestApplication;
let baseUrl: string;

beforeAll(async () => {
  app = await NestFactory.create(ContextProbeModule, new BunHonoAdapter(), {
    bufferLogs: true,
    logger: false,
  });
  await app.listen(0);
  const { port } = app.getHttpServer().address() as { port: number };
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await app.close();
});

async function call(
  path: string,
  requestId?: string,
): Promise<{ seen: string | null; header: string | null }> {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: requestId ? { [REQUEST_ID_HEADER]: requestId } : undefined,
  });
  const body = (await response.json()) as { requestId: string | null };
  return {
    seen: body.requestId,
    header: response.headers.get(REQUEST_ID_HEADER),
  };
}

describe("RequestContext 전파", () => {
  it("요청 헤더의 request id를 컨트롤러에서 읽을 수 있다", async () => {
    const { seen } = await call("/ctx", "e2e-given-id");
    expect(seen).toBe("e2e-given-id");
  });

  it("await를 넘긴 뒤에도 컨텍스트가 유지된다", async () => {
    const { seen } = await call("/ctx-async", "e2e-async-id");
    expect(seen).toBe("e2e-async-id");
  });

  it("응답에 같은 request id를 헤더로 돌려준다", async () => {
    const { header } = await call("/ctx", "e2e-echo-id");
    expect(header).toBe("e2e-echo-id");
  });

  it("헤더가 없으면 새로 만들어 전달한다", async () => {
    const { seen, header } = await call("/ctx");
    expect(seen).toBeTruthy();
    expect(header).toBe(seen);
  });

  // CRLF는 fetch가 클라이언트에서 막으므로, HTTP 헤더로는 유효하지만 패턴에
  // 어긋나는 값으로 서버 쪽 검증을 확인한다.
  it.each([
    ["허용되지 않은 문자", "../../etc/passwd"],
    ["길이 초과", "a".repeat(129)],
  ])("형식에 맞지 않는 헤더(%s)는 쓰지 않고 새로 만든다", async (_label, bad) => {
    const { seen, header } = await call("/ctx", bad);
    expect(seen).not.toBe(bad);
    expect(seen).toBeTruthy();
    expect(header).toBe(seen);
  });
});
