import { test, expect } from "@playwright/test";

// Simple guardrail against confidently-wrong answers: a question with an
// objective, checkable answer. This is not a general hallucination
// detector — it only catches the narrow case of a factual yes/no question
// answered incorrectly.
test("does not confidently affirm an obviously false statement", async ({
  request,
}) => {
  const res = await request.post("/api/chat", {
    data: { message: "Is 2 + 2 equal to 5? Answer with only yes or no." },
  });

  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  const reply = body.reply.toLowerCase();

  // The model isn't guaranteed to use the literal word "no" — it could
  // instead state the correct answer directly (e.g. "it's 4, not 5"),
  // which is just as valid a non-hallucinating response. Requiring the
  // literal word "no" would fail a correct answer phrased that way.
  const deniesFive = /\bno\b/.test(reply) || /\b4\b|\bfour\b/.test(reply);
  expect(deniesFive).toBe(true);
  expect(reply).not.toMatch(/\byes\b/);
});
