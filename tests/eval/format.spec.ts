import { test, expect } from "@playwright/test";
import { sendChat } from "./chat-client";

// Heuristic ceiling, not an exact count: the model is instructed to keep the
// reply short, and this checks it roughly follows that instruction rather
// than ignoring it and producing an essay.
test("keeps a 'one short sentence' instruction reasonably short", async ({
  request,
}) => {
  const reply = await sendChat(request, "Say hello in one short sentence.");
  expect(reply.length).toBeLessThan(200);
});
