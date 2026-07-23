import { test, expect } from "@playwright/test";

// Non-deterministic layer: hits the real backend + real local Ollama model
// (never mocked). Assertions here are heuristics about response quality,
// not exact-match checks — see TESTING.md for how this differs from the
// deterministic unit/API/E2E layers.
test("answers a simple factual question with the expected keyword", async ({
  request,
}) => {
  const res = await request.post("/api/chat", {
    data: {
      message: "What is the capital of France? Answer with only the city name.",
    },
  });

  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.reply.toLowerCase()).toContain("paris");
});
