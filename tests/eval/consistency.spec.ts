import { test, expect } from "@playwright/test";

// The exact wording is expected to differ on every call — that's the point.
// This checks two things: invariants that should hold on every individual
// call (never empty, never an unbounded wall of text), AND that the calls
// are actually consistent with each other — no single reply wildly larger
// or smaller than the others. Checking only the per-call invariants would
// not catch a real inconsistency (e.g. one curt "OK" among otherwise
// full-sentence replies), since both extremes could individually satisfy a
// generous absolute ceiling.
test("gives replies that are consistent with each other across repeated calls, not just individually valid", async ({
  request,
}) => {
  const prompt = "Explain what an LLM is in one sentence.";
  const REPEATS = 5;
  const lengths: number[] = [];

  for (let i = 0; i < REPEATS; i++) {
    const res = await request.post("/api/chat", { data: { message: prompt } });
    expect(res.ok()).toBeTruthy();

    const body = await res.json();
    expect(body.reply.trim().length).toBeGreaterThan(0);
    expect(body.reply.length).toBeLessThan(500);
    lengths.push(body.reply.length);
  }

  // Generous ratio (not exact equality) to tolerate the model's natural
  // wording variance (observed ~1.5x across manual runs) while still
  // catching a genuine outlier.
  const shortest = Math.min(...lengths);
  const longest = Math.max(...lengths);
  expect(longest / shortest).toBeLessThan(4);
});

// Cheap content check: length consistency (above) says nothing about
// whether the replies are actually about the same thing. This catches one
// specific failure mode — the model wandering off-topic on some calls —
// without needing to understand meaning, just topic keywords.
test("stays on topic across repeated calls (keyword-based content check)", async ({
  request,
}) => {
  const prompt = "Explain what an LLM is in one sentence.";
  const REPEATS = 5;
  const topicKeywords = /\b(language|model|ai|artificial intelligence|llm)\b/i;

  for (let i = 0; i < REPEATS; i++) {
    const res = await request.post("/api/chat", { data: { message: prompt } });
    expect(res.ok()).toBeTruthy();

    const body = await res.json();
    expect(body.reply).toMatch(topicKeywords);
  }
});

// Expensive content check: uses the model itself as a judge of whether the
// repeated replies convey the same core idea, even when worded completely
// differently — something a keyword check cannot verify. This costs one
// extra model call and depends on the judge's own reliability, which is
// itself non-deterministic; it is a stronger signal than the keyword check,
// not a replacement for it.
//
// Observed failure rate during development: 1 failure in 8 runs (~12.5%),
// with the small 3B judge model answering "no" once for otherwise-similar
// replies. Wrapped with retries (below) as the standard way to handle a
// probabilistic check like this: an isolated bad judgment doesn't fail the
// suite, but a consistently wrong judgment still would.
test.describe("LLM-as-judge", () => {
  test.describe.configure({ retries: 2 });

  test("all repeated replies convey the same core idea, as judged by the model itself (LLM-as-judge)", async ({
    request,
  }) => {
    const prompt = "Explain what an LLM is in one sentence.";
    const REPEATS = 5;
    const replies: string[] = [];

    for (let i = 0; i < REPEATS; i++) {
      const res = await request.post("/api/chat", { data: { message: prompt } });
      expect(res.ok()).toBeTruthy();
      const body = await res.json();
      replies.push(body.reply);
    }

    const numbered = replies
      .map((reply, i) => `${i + 1}. ${reply.slice(0, 200)}`)
      .join("\n");
    const judgePrompt =
      `Here are ${REPEATS} answers to the same question, each numbered.\n\n${numbered}\n\n` +
      `Do all ${REPEATS} answers convey basically the same core idea, even if worded ` +
      `differently? Answer with only "yes" or "no".`;

    const judgeRes = await request.post("/api/chat", {
      data: { message: judgePrompt },
    });
    expect(judgeRes.ok()).toBeTruthy();
    const judgeBody = await judgeRes.json();

    expect(judgeBody.reply.toLowerCase()).toMatch(/\byes\b/);
  });
});
