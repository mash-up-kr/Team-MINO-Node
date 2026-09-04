import { describe, expect, it } from "bun:test";
import { RequestContext } from "./request-context";

describe("RequestContext", () => {
  it("비동기 실행 흐름 안에서 컨텍스트를 유지하고 반환한다", async () => {
    const result = await RequestContext.run(
      { requestId: "req-123" },
      async () => {
        expect(RequestContext.getRequestId()).toBe("req-123");

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
      const { requestId } = RequestContext.extractOrCreate(request);
      expect(requestId).toBe("client-req-001");
    });

    it("x-correlation-id 헤더가 있으면 이를 requestId로 사용한다", () => {
      const request = {
        headers: { "x-correlation-id": "corr-002" },
      };
      const { requestId } = RequestContext.extractOrCreate(request);
      expect(requestId).toBe("corr-002");
    });

    it("x-cloud-trace-context 헤더에서 traceId를 추출하여 requestId로 사용한다", () => {
      const request = {
        headers: {
          "x-cloud-trace-context": "105445aa7843bc8bf206b120001000/1;o=1",
        },
      };
      const { requestId } = RequestContext.extractOrCreate(request);
      expect(requestId).toBe("105445aa7843bc8bf206b120001000");
    });

    it("x-request-id와 x-cloud-trace-context가 둘 다 있으면 x-request-id가 우선순위를 갖는다", () => {
      const request = {
        headers: {
          "x-request-id": "req-custom",
          "x-cloud-trace-context": "gcp-trace-id/1;o=1",
        },
      };
      const { requestId } = RequestContext.extractOrCreate(request);
      expect(requestId).toBe("req-custom");
    });

    it("traceparent (W3C) 헤더에서 traceId를 추출하여 requestId로 사용한다", () => {
      const request = {
        headers: {
          traceparent:
            "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
        },
      };
      const { requestId } = RequestContext.extractOrCreate(request);
      expect(requestId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
    });

    it("헤더가 없으면 UUID를 생성한다", () => {
      const request = {};
      const { requestId } = RequestContext.extractOrCreate(request);
      expect(requestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });

    it("x-request-id에 개행문자나 공백 등 유효하지 않은 문자가 포함되어 있으면 무시하고 UUID를 생성한다", () => {
      const request = {
        headers: {
          "x-request-id": "evil-id\r\nX-Injected-Header: true",
        },
      };
      const { requestId } = RequestContext.extractOrCreate(request);
      expect(requestId).not.toContain("evil-id");
      expect(requestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });

    it("x-request-id가 유효하지 않고 x-correlation-id가 유효하면 x-correlation-id를 사용한다", () => {
      const request = {
        headers: {
          "x-request-id": "bad\r\ninjection",
          "x-correlation-id": "valid-correlation-id-001",
        },
      };
      const { requestId } = RequestContext.extractOrCreate(request);
      expect(requestId).toBe("valid-correlation-id-001");
    });

    it("x-cloud-trace-context에 유효하지 않은 문자가 포함되어 있으면 무시하고 UUID를 생성한다", () => {
      const request = {
        headers: {
          "x-cloud-trace-context": "bad trace id with spaces/1;o=1",
        },
      };
      const { requestId } = RequestContext.extractOrCreate(request);
      expect(requestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });

    it("traceparent에 유효하지 않은 문자가 포함되어 있으면 무시하고 UUID를 생성한다", () => {
      const request = {
        headers: {
          traceparent: "00-bad\r\ntrace-span-01",
        },
      };
      const { requestId } = RequestContext.extractOrCreate(request);
      expect(requestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });
  });
});
