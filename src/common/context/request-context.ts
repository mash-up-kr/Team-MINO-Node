import { AsyncLocalStorage } from "node:async_hooks";
import { readRequestHeader } from "../guards/request-header";

export type RequestContextData = {
  readonly requestId: string;
  readonly traceId?: string;
  userId?: string;
  authUid?: string;
};

export const requestContextStorage =
  new AsyncLocalStorage<RequestContextData>();

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

  /** 현재 요청의 Trace ID를 가져온다. */
  getTraceId(): string | undefined {
    return RequestContext.get()?.traceId;
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
   * HTTP 요청 헤더에서 Request ID / Trace ID를 추출하거나 새로 생성한다.
   *
   * 우선순위:
   * 1. x-request-id / x-correlation-id
   * 2. x-cloud-trace-context (GCP Cloud Trace 형식: TRACE_ID/SPAN_ID;o=1)
   * 3. traceparent (W3C 표준: 00-TRACE_ID-SPAN_ID-FLAGS)
   * 4. crypto.randomUUID()
   */
  extractOrCreate(request: unknown): {
    requestId: string;
    traceId?: string;
  } {
    const incomingRequestId =
      readRequestHeader(request, "x-request-id")?.trim() ||
      readRequestHeader(request, "x-correlation-id")?.trim();

    const cloudTraceHeader = readRequestHeader(
      request,
      "x-cloud-trace-context",
    )?.trim();
    const traceparentHeader = readRequestHeader(request, "traceparent")?.trim();

    let traceId: string | undefined;

    if (cloudTraceHeader) {
      const [tid] = cloudTraceHeader.split("/");
      if (tid) {
        traceId = tid.trim();
      }
    } else if (traceparentHeader) {
      const parts = traceparentHeader.split("-");
      if (parts.length >= 4 && parts[1]) {
        traceId = parts[1].trim();
      }
    }

    const requestId = incomingRequestId || traceId || crypto.randomUUID();

    return {
      requestId,
      traceId,
    };
  },
} as const;
