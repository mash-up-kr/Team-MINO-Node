import { AsyncLocalStorage } from "node:async_hooks";
import { readRequestHeader } from "../guards/request-header";

export type RequestContextData = {
  readonly requestId: string;
  userId?: string;
  authUid?: string;
};

export const requestContextStorage =
  new AsyncLocalStorage<RequestContextData>();

export const REQUEST_ID_HEADER = "x-request-id" as const;

/**
 * HTTP 헤더 인젝션 및 비정상 문자열을 방어하기 위한 안전한 Request ID 패턴.
 * 영숫자, 하이픈(-), 언더스코어(_) 조합 (1~128자).
 */
const SAFE_REQUEST_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

function sanitizeId(id: string | undefined): string | undefined {
  if (!id) return undefined;
  const trimmed = id.trim();
  return SAFE_REQUEST_ID_PATTERN.test(trimmed) ? trimmed : undefined;
}

export const RequestContext = {
  /** 비동기 실행 흐름에 컨텍스트를 주입하고 콜백을 실행한다. */
  run<T>(data: RequestContextData, fn: () => T): T {
    return requestContextStorage.run(data, fn);
  },

  /** 현재 비동기 컨텍스트를 가져온다. */
  get(): RequestContextData | undefined {
    return requestContextStorage.getStore();
  },

  /** 현재 요청의 Request ID를 가져온다. */
  getRequestId(): string | undefined {
    return RequestContext.get()?.requestId;
  },

  /** 현재 요청의 User ID를 가져온다. */
  getUserId(): string | undefined {
    return RequestContext.get()?.userId;
  },

  /** 현재 요청의 Auth UID를 가져온다. */
  getAuthUid(): string | undefined {
    return RequestContext.get()?.authUid;
  },

  /** 인증 후 유저 ID를 현재 컨텍스트에 설정한다. */
  setUserId(userId: string): void {
    const store = RequestContext.get();
    if (store) {
      store.userId = userId;
    }
  },

  /** 인증 후 Firebase Auth UID를 현재 컨텍스트에 설정한다. */
  setAuthUid(authUid: string): void {
    const store = RequestContext.get();
    if (store) {
      store.authUid = authUid;
    }
  },

  /**
   * HTTP 요청 헤더에서 Request ID를 추출하거나 새로 생성한다.
   * 헤더 인젝션을 방어하기 위해 안전한 문자열 패턴을 검증한다.
   *
   * 우선순위:
   * 1. x-request-id / x-correlation-id
   * 2. x-cloud-trace-context (GCP Cloud Trace 형식: TRACE_ID/SPAN_ID;o=1)
   * 3. traceparent (W3C 표준: 00-TRACE_ID-SPAN_ID-FLAGS)
   * 4. crypto.randomUUID()
   */
  extractOrCreate(request: unknown): {
    requestId: string;
  } {
    const incomingRequestId =
      sanitizeId(readRequestHeader(request, "x-request-id")) ||
      sanitizeId(readRequestHeader(request, "x-correlation-id"));

    const cloudTraceHeader = readRequestHeader(
      request,
      "x-cloud-trace-context",
    );
    const traceparentHeader = readRequestHeader(request, "traceparent");

    let upstreamTraceId: string | undefined;

    if (cloudTraceHeader) {
      const [tid] = cloudTraceHeader.split("/");
      upstreamTraceId = sanitizeId(tid);
    } else if (traceparentHeader) {
      const parts = traceparentHeader.split("-");
      if (parts.length >= 4 && parts[1]) {
        upstreamTraceId = sanitizeId(parts[1]);
      }
    }

    const requestId =
      incomingRequestId || upstreamTraceId || crypto.randomUUID();

    return {
      requestId,
    };
  },
} as const;
