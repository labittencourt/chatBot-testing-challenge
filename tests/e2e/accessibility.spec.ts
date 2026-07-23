import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { ChatPage } from "./chat-page";

// axe-core is the industry-standard automated accessibility scanner. It
// catches objective, rule-based violations (missing labels, contrast,
// invalid ARIA usage) — it cannot verify a screen reader actually announces
// the loading/error states correctly, only that the markup isn't broken in
// a way that would prevent that.
test("initial chat page has no automatically detectable accessibility violations", async ({
  page,
}) => {
  const chat = new ChatPage(page);
  await chat.goto();

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

// Confirmed defect, found by this scan (not assumed) — see
// docs/FINDINGS.md. The .msg-user bubble (`background: #2b5cff` in
// styles.css) fails WCAG 2 AA color contrast: the "You" label measures a
// 2.45:1 ratio and the message text 4.23:1, both under the required 4.5:1.
// `test.fail()` documents this until the base app's styles are updated —
// fixing styles.css is outside this testing framework's scope, same as
// every other confirmed-but-unfixed defect in this suite.
//
// Scans after a real exchange so the dynamically-rendered message bubbles
// are included — the initial-load scan above never sees this markup.
test("chat page with message history has no automatically detectable accessibility violations", async ({
  page,
}) => {
  test.fail();

  const chat = new ChatPage(page);
  await chat.goto();

  await chat.sendMessage("Say hello in one short sentence.");
  await expect(chat.botMessages.last()).toBeVisible({ timeout: 30_000 });

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
