import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp, type Generator } from "../../src/backend/app";
import { MAX_MESSAGE_LENGTH } from "../../src/backend/validation";

function upstreamError(status: number, message: string): Error & { status: number } {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}

function appWithGenerate(generate: Generator, timeoutMs?: number) {
  return createApp({ generate, timeoutMs });
}

describe("POST /api/chat", () => {
  it("returns 200 with the generated reply and a numeric latencyMs", async () => {
    const app = appWithGenerate(async () => "Hello there");
    const res = await request(app).post("/api/chat").send({ message: "hi" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      reply: "Hello there",
      latencyMs: expect.any(Number),
    });
  });

  it("returns 400 when the message field is missing", async () => {
    const app = appWithGenerate(async () => "unused");
    const res = await request(app).post("/api/chat").send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 400 when the message is empty after trimming", async () => {
    const app = appWithGenerate(async () => "unused");
    const res = await request(app).post("/api/chat").send({ message: "   " });

    expect(res.status).toBe(400);
  });

  it("returns 400 when the message is not a string", async () => {
    const app = appWithGenerate(async () => "unused");
    const res = await request(app).post("/api/chat").send({ message: 123 });

    expect(res.status).toBe(400);
  });

  it("returns 400 when the message exceeds the max length", async () => {
    const app = appWithGenerate(async () => "unused");
    const res = await request(app)
      .post("/api/chat")
      .send({ message: "a".repeat(MAX_MESSAGE_LENGTH + 1) });

    expect(res.status).toBe(400);
  });

  it("returns 429 when the upstream reports a rate limit", async () => {
    const app = appWithGenerate(async () => {
      throw upstreamError(429, "rate limited");
    });
    const res = await request(app).post("/api/chat").send({ message: "hi" });

    expect(res.status).toBe(429);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 503 when the upstream model service is unavailable", async () => {
    const app = appWithGenerate(async () => {
      throw upstreamError(503, "Ollama is not running");
    });
    const res = await request(app).post("/api/chat").send({ message: "hi" });

    expect(res.status).toBe(503);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 502 for upstream failures without a specific status", async () => {
    const app = appWithGenerate(async () => {
      throw new Error("something unexpected happened");
    });
    const res = await request(app).post("/api/chat").send({ message: "hi" });

    expect(res.status).toBe(502);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 504 when the model exceeds the timeout budget", async () => {
    const app = appWithGenerate(() => new Promise<string>(() => {}), 10);
    const res = await request(app).post("/api/chat").send({ message: "hi" });

    expect(res.status).toBe(504);
    expect(res.body).toHaveProperty("error");
  });
});

// Confirmed contract inconsistency, reported as a defect rather than fixed
// here — see RST-NOTES.md #10. These requests never reach validateMessage:
// Express's own body-parser middleware rejects them first, before the
// route handler runs, so the app's {error} JSON contract does not apply.
// These tests pin down the current, real behavior (including its
// inconsistency) so any future change to it is a deliberate decision, not
// an unnoticed regression.
describe("POST /api/chat — body-parser edge cases (never reach validateMessage)", () => {
  it("returns 413 as an HTML page, not the app's {error} JSON shape, for an oversized body", async () => {
    const app = appWithGenerate(async () => "unused");
    const res = await request(app)
      .post("/api/chat")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ message: "a".repeat(40_000) }));

    expect(res.status).toBe(413);
    expect(res.type).toBe("text/html");
  });

  it("returns 400 as an HTML page, not the app's {error} JSON shape, for malformed JSON", async () => {
    const app = appWithGenerate(async () => "unused");
    const res = await request(app)
      .post("/api/chat")
      .set("Content-Type", "application/json")
      .send("{not valid json");

    expect(res.status).toBe(400);
    expect(res.type).toBe("text/html");
    expect(res.body).not.toHaveProperty("error");
  });

  it("still returns the app's normal {error} JSON shape with a 400 when there is no body at all", async () => {
    const app = appWithGenerate(async () => "unused");
    const res = await request(app).post("/api/chat");

    expect(res.status).toBe(400);
    expect(res.type).toBe("application/json");
    expect(res.body).toEqual({ error: "message must be a string" });
  });
});
