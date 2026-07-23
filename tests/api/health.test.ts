import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../src/backend/app";

describe("GET /api/health", () => {
  it("returns 200 with status ok and the configured model", async () => {
    const app = createApp({ generate: async () => "unused" });
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("status", "ok");
    expect(res.body).toHaveProperty("model");
    expect(typeof res.body.model).toBe("string");
  });
});

describe("GET /api/openapi.json", () => {
  it("returns 200 with a valid OpenAPI document", async () => {
    const app = createApp({ generate: async () => "unused" });
    const res = await request(app).get("/api/openapi.json");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("openapi");
    expect(res.body).toHaveProperty("paths");
  });
});

describe("GET /api/docs", () => {
  it("serves the Swagger UI page", async () => {
    const app = createApp({ generate: async () => "unused" });
    const res = await request(app).get("/api/docs/");
    expect(res.status).toBe(200);
    expect(res.type).toBe("text/html");
  });
});
