import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { withTimeout, TimeoutError } from "../../src/backend/timeout";

describe("withTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves with the value when the promise settles before the timeout", async () => {
    const promise = new Promise<string>((resolve) =>
      setTimeout(() => resolve("done"), 10),
    );
    const result = withTimeout(promise, 100);
    await vi.advanceTimersByTimeAsync(10);
    await expect(result).resolves.toBe("done");
  });

  it("rejects with TimeoutError when the promise is slower than the budget", async () => {
    const promise = new Promise<string>((resolve) =>
      setTimeout(() => resolve("too late"), 100),
    );
    const result = withTimeout(promise, 10);
    const assertion = expect(result).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(10);
    await assertion;
  });

  it("propagates the original rejection when the promise fails before the timeout", async () => {
    const promise = Promise.reject(new Error("boom"));
    await expect(withTimeout(promise, 100)).rejects.toThrow("boom");
  });

  it("clears its internal timer once the wrapped promise resolves", async () => {
    await withTimeout(Promise.resolve("done"), 100);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears its internal timer once the wrapped promise rejects before the timeout", async () => {
    await withTimeout(Promise.reject(new Error("boom")), 100).catch(() => {});
    expect(vi.getTimerCount()).toBe(0);
  });

  // Microtasks (promise resolution) always run before the next macrotask
  // (setTimeout, even at 0ms), so an already-settled promise should win a
  // 0ms timeout budget. With fake timers, the internal setTimeout never
  // fires unless the clock is explicitly advanced, so this only passes if
  // resolution happens purely through the microtask queue.
  it("resolves an already-settled promise even with a 0ms timeout budget", async () => {
    await expect(withTimeout(Promise.resolve("done"), 0)).resolves.toBe("done");
  });
});
