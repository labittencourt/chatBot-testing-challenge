import { test, expect } from "@playwright/test";
import { sendChat } from "./chat-client";

// Non-deterministic layer: hits the real backend + real local Ollama model
// (never mocked). Assertions here are heuristics about response quality,
// not exact-match checks — see TESTING.md for how this differs from the
// deterministic unit/API/E2E layers.
test("answers a simple factual question with the expected keyword", async ({
  request,
}) => {
  const reply = await sendChat(
    request,
    "What is the capital of France? Answer with only the city name.",
  );
  expect(reply.toLowerCase()).toContain("paris");
});
