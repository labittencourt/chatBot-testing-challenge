import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../src/backend/app";

// createApp() binds `generate` once per app instance, and Express handles
// each request in its own closure over the validated message — there's no
// shared mutable state in app.ts between concurrent requests. This test
// proves that in practice: fire several requests at once, with a mock
// `generate` that finishes in random order, and confirm each response still
// corresponds to its own request. A bug that accidentally shared state
// across requests (e.g. a module-level variable instead of a per-request
// one) would show up here as a reply echoing the wrong message.
describe("POST /api/chat — concurrency", () => {
  it("handles concurrent requests independently, without mixing up replies", async () => {
    const app = createApp({
      generate: async (prompt) => {
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 20));
        return `echo:${prompt}`;
      },
    });

    const messages = ["first", "second", "third", "fourth", "fifth"];
    const responses = await Promise.all(
      messages.map((message) =>
        request(app).post("/api/chat").send({ message }),
      ),
    );

    responses.forEach((res, i) => {
      expect(res.status).toBe(200);
      expect(res.body.reply).toBe(`echo:${messages[i]}`);
    });
  });
});
