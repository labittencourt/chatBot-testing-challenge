import { describe, it, expect, vi, afterEach } from "vitest";
import { sendChat } from "../../src/frontend/api";

const originalFetch = globalThis.fetch;

function mockFetchResponse(status: number, body: unknown) {
  globalThis.fetch = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

describe("sendChat", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns the parsed reply on a successful response", async () => {
    mockFetchResponse(200, { reply: "hi", latencyMs: 42 });
    const result = await sendChat("hello");
    expect(result).toEqual({ reply: "hi", latencyMs: 42 });
  });

  it("uses the backend-provided error message when the body has one", async () => {
    mockFetchResponse(400, { error: "message must not be empty" });
    await expect(sendChat("")).rejects.toThrow("message must not be empty");
  });

  it.each([
    [429, "The model rate limit was reached. Wait a moment and try again."],
    [
      503,
      "The local model service is unavailable. Confirm Ollama is running and try again.",
    ],
    [504, "The model took too long to respond. Please try again."],
    [
      502,
      "The model could not generate a response right now. Please try again.",
    ],
    [418, "request failed (418)"],
  ])(
    "falls back to a default message for status %i when the body has no error field",
    async (status, expectedMessage) => {
      mockFetchResponse(status, {});
      await expect(sendChat("hi")).rejects.toThrow(expectedMessage);
    },
  );
});
