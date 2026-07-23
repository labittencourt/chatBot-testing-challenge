import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../src/backend/app";

// `app.use(cors())` with no options is maximally permissive: it returns
// `Access-Control-Allow-Origin: *`, allowing any origin to call this API.
// That's fine for local-only development (the stated purpose of this app),
// but is a real risk if this code is ever deployed as-is — this test pins
// the current, permissive behavior down so a future change to the CORS
// policy is a deliberate decision, not an unnoticed regression either way.
describe("CORS", () => {
  it("allows any origin on API responses", async () => {
    const app = createApp({ generate: async () => "unused" });
    const res = await request(app)
      .get("/api/health")
      .set("Origin", "http://example.com");

    expect(res.headers["access-control-allow-origin"]).toBe("*");
  });
});
