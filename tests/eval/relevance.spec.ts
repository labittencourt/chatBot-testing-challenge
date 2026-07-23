import { test, expect } from "@playwright/test";
import { sendChat } from "./chat-client";

// Non-deterministic layer: hits the real backend + real local Ollama model
// (never mocked). Assertions here are heuristics about response quality,
// not exact-match checks — see TESTING.md for how this differs from the
// deterministic unit/API/E2E layers.
//
// Breadth: more than one factual question, so this isn't just proving the
// model can answer one specific, possibly-memorized trivia fact. Playwright
// has no test.each (unlike Jest/Vitest) — a plain loop calling test() at
// module load time is the idiomatic way to generate parameterized tests.
const FACTUAL_QUESTIONS: Array<[question: string, expectedKeyword: string]> = [
  ["What is the capital of France? Answer with only the city name.", "paris"],
  ["What is the capital of Japan? Answer with only the city name.", "tokyo"],
  [
    "What planet is known as the Red Planet? Answer with only the planet name.",
    "mars",
  ],
];

for (const [question, expectedKeyword] of FACTUAL_QUESTIONS) {
  test(`answers a simple factual question with the expected keyword: ${question}`, async ({
    request,
  }) => {
    const reply = await sendChat(request, question);
    expect(reply.toLowerCase()).toContain(expectedKeyword);
  });
}

// Robustness: a single roll of the dice can fail even when the model is
// working correctly (see TESTING.md on this layer's non-determinism). Instead
// of asserting the keyword appears on every single call, this runs the same
// question several times and requires a majority to pass — the standard way
// to evaluate a probabilistic system without either over-trusting one lucky
// run or failing the suite over one unlucky one.
test("answers the same factual question correctly on a majority of repeated calls", async ({
  request,
}) => {
  const REPEATS = 5;
  const REQUIRED_PASSES = 4;
  let passes = 0;

  for (let i = 0; i < REPEATS; i++) {
    const reply = await sendChat(
      request,
      "What is the capital of France? Answer with only the city name.",
    );
    if (reply.toLowerCase().includes("paris")) passes++;
  }

  expect(passes).toBeGreaterThanOrEqual(REQUIRED_PASSES);
});
