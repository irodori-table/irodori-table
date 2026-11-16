import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  connectionAttemptTimeoutMs,
  startConnectionAttempt,
} from "@/features/connections/connection-attempt";

/**
 * An unreachable host held Connect and Test on "Connecting" until the OS gave
 * up on the TCP handshake, minutes later. An attempt now stops waiting after
 * ten seconds or on Cancel, and hands anything that answers after that back
 * to the caller with the reason, so a cancelled connect can be closed while a
 * merely slow one can still be kept.
 */

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("startConnectionAttempt", () => {
  it("waits ten seconds by default", () => {
    expect(connectionAttemptTimeoutMs).toBe(10_000);
  });

  it("settles with the value when the work finishes in time", async () => {
    const attempt = startConnectionAttempt(async () => "info");

    await expect(attempt.result).resolves.toEqual({
      kind: "done",
      value: "info",
    });
  });

  it("gives up at the timeout and hands a late success back", async () => {
    const work = deferred<string>();
    const onLateSuccess = vi.fn();
    const attempt = startConnectionAttempt(() => work.promise, {
      timeoutMs: 10_000,
      onLateSuccess,
    });

    await vi.advanceTimersByTimeAsync(9_999);
    let settled = false;
    void attempt.result.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await expect(attempt.result).resolves.toEqual({ kind: "timeout" });

    work.resolve("late");
    await vi.runAllTimersAsync();
    expect(onLateSuccess).toHaveBeenCalledWith("late", "timeout");
  });

  it("stops waiting on cancel, before the timeout", async () => {
    const work = deferred<string>();
    const onLateSuccess = vi.fn();
    const attempt = startConnectionAttempt(() => work.promise, {
      onLateSuccess,
    });

    attempt.cancel();
    await expect(attempt.result).resolves.toEqual({ kind: "cancelled" });

    work.resolve("late");
    await vi.runAllTimersAsync();
    expect(onLateSuccess).toHaveBeenCalledWith("late", "cancelled");
  });

  it("reports a failure that arrives in time", async () => {
    const attempt = startConnectionAttempt(async () => {
      throw new Error("password authentication failed");
    });

    await expect(attempt.result).rejects.toThrow(
      "password authentication failed",
    );
  });

  it("drops a failure that arrives after the attempt was given up on", async () => {
    const work = deferred<string>();
    const onLateSuccess = vi.fn();
    const attempt = startConnectionAttempt(() => work.promise, {
      onLateSuccess,
    });

    attempt.cancel();
    await expect(attempt.result).resolves.toEqual({ kind: "cancelled" });
    work.reject(new Error("connection refused"));
    await vi.runAllTimersAsync();

    expect(onLateSuccess).not.toHaveBeenCalled();
  });

  it("ignores cancel once the attempt has finished", async () => {
    const attempt = startConnectionAttempt(async () => "info");
    await expect(attempt.result).resolves.toEqual({
      kind: "done",
      value: "info",
    });

    attempt.cancel();

    await expect(attempt.result).resolves.toEqual({
      kind: "done",
      value: "info",
    });
  });
});
