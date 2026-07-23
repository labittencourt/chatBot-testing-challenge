import { test, expect } from "@playwright/test";

// Heuristic ceiling, not an exact count: the model is instructed to keep the
// reply short, and this checks it roughly follows that instruction rather
// than ignoring it and producing an essay.
test("keeps a 'one short sentence' instruction reasonably short", async ({
  request,
}) => {
  const res = await request.post("/api/chat", {
    data: { message: "Say hello in one short sentence." },
  });

  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.reply.length).toBeLessThan(200);
});
