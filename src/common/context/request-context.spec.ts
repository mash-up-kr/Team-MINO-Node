import { describe, expect, it } from "bun:test";
import { RequestContext } from "./request-context";

describe("RequestContext", () => {
  it("비동기 실행 흐름 안에서 컨텍스트를 유지하고 반환한다", async () => {
    const result = await RequestContext.run(
      { requestId: "req-123", traceId: "trace-abc" },
      async () => {
        expect(RequestContext.getRequestId()).toBe("req-123");
        expect(RequestContext.getTraceId()).toBe("trace-abc");

        // 중첩된 비동기 작업에서도 유지
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(RequestContext.getRequestId()).toBe("req-123");

        RequestContext.setUserId("user-456");
        RequestContext.setAuthUid("auth-789");

        expect(RequestContext.getUserId()).toBe("user-456");
        expect(RequestContext.getAuthUid()).toBe("auth-789");

        return "done";
      },
    );

    expect(result).toBe("done");
    // 스코프 밖에서는 컨텍스트가 없어야 함
    expect(RequestContext.get()).toBeUndefined();
  });

  describe("extractOrCreate", () => {
    it("x-request-id 헤더가 있으면 이를 requestId로 사용한다", () => {
      const request = {
        headers: { "x-request-id": "client-req-001" },
      };
      const { requestId, traceId } = RequestContext.extractOrCreate(request);
      expect(requestId).toBe("client-req-001");
      expect(traceId).toBeUndefined();
    });

    it("x-correlation-id 헤더가 있으면 이를 requestId로 사용한다", () => {
      const request = {
        headers: { "x-correlation-id": "corr-002" },
      };
      const { requestId } = RequestContext.extractOrCreate(request);
      expect(requestId).toBe("corr-002");
    });

    it("x-cloud-trace-context 헤더에서 traceId를 파싱한다", () => {
      const request = {
        headers: {
          "x-cloud-trace-context": "105445aa7843bc8bf206b120001000/1;o=1",
        },
      };
      const { requestId, traceId } = RequestContext.extractOrCreate(request);
      expect(traceId).toBe("105445aa7843bc8bf206b120001000");
      expect(requestId).toBe("105445aa7843bc8bf206b120001000");
    });

    it("x-request-id와 x-cloud-trace-context가 둘 다 있으면 각각 보관한다", () => {
      const request = {
        headers: {
          "x-request-id": "req-custom",
          "x-cloud-trace-context": "gcp-trace-id/1;o=1",
        },
      };
      const { requestId, traceId } = RequestContext.extractOrCreate(request);
      expect(requestId).toBe("req-custom");
      expect(traceId).toBe("gcp-trace-id");
    });

    it("traceparent (W3C) 헤더에서 traceId를 파싱한다", () => {
      const request = {
        headers: {
          traceparent:
            "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
        },
      };
      const { requestId, traceId } = RequestContext.extractOrCreate(request);
      expect(traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
      expect(requestId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
    });

    it("헤더가 없으면 UUID를 생성한다", () => {
      const request = {};
      const { requestId, traceId } = RequestContext.extractOrCreate(request);
      expect(requestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(traceId).toBeUndefined();
    });
  });
});
