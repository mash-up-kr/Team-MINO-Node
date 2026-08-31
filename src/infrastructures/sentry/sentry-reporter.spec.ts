import { describe, expect, it, jest } from "bun:test";
import * as Sentry from "@sentry/bun";
import { RequestContext } from "../../common/context/request-context";
import { SentryErrorReporter } from "./sentry-reporter";

describe("SentryErrorReporter", () => {
  const reporter = new SentryErrorReporter();

  it("Sentry scope에 error.code, http.status_code, request_id, userId 태그를 주입하여 캡처한다", async () => {
    const setTagSpy = jest.fn();
    const setUserSpy = jest.fn();
    const setExtrasSpy = jest.fn();
    const captureExceptionSpy = jest
      .spyOn(Sentry, "captureException")
      .mockImplementation(() => "event-id");

    const mockScope = {
      setTag: setTagSpy,
      setUser: setUserSpy,
      setExtras: setExtrasSpy,
    };

    jest.spyOn(Sentry, "withScope").mockImplementation(((
      ...args: unknown[]
    ) => {
      const callback = (typeof args[0] === "function" ? args[0] : args[1]) as (
        scope: unknown,
      ) => unknown;
      return callback(mockScope);
    }) as never);

    const error = new Error("something went wrong");

    await RequestContext.run({ requestId: "req-abc-123" }, async () => {
      RequestContext.setUserId("user-xyz-456");

      reporter.report(error, {
        errorCode: "SOME_ERROR_CODE",
        httpStatusCode: 500,
        extra: { foo: "bar" },
      });
    });

    expect(setTagSpy).toHaveBeenCalledWith("error.code", "SOME_ERROR_CODE");
    expect(setTagSpy).toHaveBeenCalledWith("http.status_code", 500);
    expect(setTagSpy).toHaveBeenCalledWith("request_id", "req-abc-123");
    expect(setUserSpy).toHaveBeenCalledWith({ id: "user-xyz-456" });
    expect(setExtrasSpy).toHaveBeenCalledWith({ foo: "bar" });
    expect(captureExceptionSpy).toHaveBeenCalledWith(error);
  });
});
