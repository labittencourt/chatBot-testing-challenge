import { test, expect } from "@playwright/test";
import { MAX_MESSAGE_LENGTH } from "../../src/backend/validation";
import { ChatPage } from "./chat-page";

test("user can send a message and see the bot reply", async ({ page }) => {
  const chat = new ChatPage(page);
  await chat.goto();

  await chat.sendMessage("Say hello in one short sentence.");

  await expect(chat.userMessages.last()).toContainText(
    "Say hello in one short sentence.",
  );
  await expect(chat.status).toBeVisible();

  await expect(chat.botMessages.last()).toBeVisible({ timeout: 30_000 });
  await expect(chat.botMessages.last()).not.toBeEmpty();
  await expect(chat.status).toBeHidden();
});

test("send button is disabled until the composer has non-whitespace text", async ({
  page,
}) => {
  const chat = new ChatPage(page);
  await chat.goto();

  await expect(chat.sendButton).toBeDisabled();

  await chat.input.fill("   ");
  await expect(chat.sendButton).toBeDisabled();

  await chat.input.fill("hi");
  await expect(chat.sendButton).toBeEnabled();
});

test("keeps the full conversation history across multiple exchanges", async ({
  page,
}) => {
  const chat = new ChatPage(page);
  await chat.goto();

  await chat.sendMessage("What is 2 + 2?");
  await expect(chat.botMessages.first()).toBeVisible({ timeout: 30_000 });

  await chat.sendMessage("And what is 3 + 3?");
  await expect(chat.botMessages.nth(1)).toBeVisible({ timeout: 30_000 });

  await expect(chat.userMessages).toHaveCount(2);
  await expect(chat.botMessages).toHaveCount(2);
  await expect(chat.userMessages.first()).toContainText("What is 2 + 2?");
  await expect(chat.userMessages.nth(1)).toContainText("And what is 3 + 3?");
});

test("shows a validation error when the message exceeds the max length", async ({
  page,
}) => {
  const chat = new ChatPage(page);
  await chat.goto();

  await chat.sendMessage("a".repeat(MAX_MESSAGE_LENGTH + 1));

  await expect(chat.alert).toContainText(`${MAX_MESSAGE_LENGTH} characters`);

  // Composer is empty after the failed submit (cleared optimistically before
  // the request), so re-enabling only happens once there is text again.
  await chat.input.fill("try again");
  await expect(chat.sendButton).toBeEnabled();
});

test("clears a previous error as soon as a new message is submitted, before the new reply arrives", async ({
  page,
}) => {
  const chat = new ChatPage(page);
  await chat.goto();

  await chat.sendMessage("a".repeat(MAX_MESSAGE_LENGTH + 1));
  await expect(chat.alert).toBeVisible();

  // The real model reply can take seconds; the old error must disappear at
  // submit time, not only once the new reply arrives.
  await chat.sendMessage("Say hello in one short sentence.");
  await expect(chat.alert).toBeHidden();

  await expect(chat.botMessages.last()).toBeVisible({ timeout: 30_000 });
});

test("pressing Enter with an empty or whitespace-only composer does not submit", async ({
  page,
}) => {
  const chat = new ChatPage(page);
  await chat.goto();

  await chat.input.press("Enter");
  await expect(chat.userMessages).toHaveCount(0);

  await chat.input.fill("   ");
  await chat.input.press("Enter");
  await expect(chat.userMessages).toHaveCount(0);
});

// Known open question, not yet aligned with product — see RST-NOTES.md #8.
// The composer clears the input unconditionally before the request settles,
// so a failed request currently loses whatever the user typed. `test.fail()`
// keeps this documented until someone deliberately decides the composer
// should restore the text on failure.
test("restores the original message to the composer when the request fails (pending product decision)", async ({
  page,
}) => {
  test.fail();

  const chat = new ChatPage(page);
  await chat.goto();
  await page.route("**/api/chat", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: "the local model service is temporarily unavailable",
      }),
    }),
  );

  const message = "This should not be lost if the request fails.";
  await chat.sendMessage(message);

  await expect(chat.alert).toBeVisible();
  await expect(chat.input).toHaveValue(message);
});

// Confirmed race, pending a dev-team decision on how to close it — see
// RST-NOTES.md #9. Two synchronous form submissions (no render in between)
// both read `loading` as `false` from the same stale closure, so the guard
// in `onSubmit` does not prevent two overlapping requests. `test.fail()`
// keeps this documented as a real, reproduced defect rather than a
// theoretical one.
//
// No artificial delay is needed on the mocked response: both
// requestSubmit() calls below happen synchronously, so whether the guard
// blocks the second one is already decided before either network response
// could possibly arrive, at any delay.
test("does not allow a second submission to overlap with one already in flight", async ({
  page,
}) => {
  test.fail();

  const chat = new ChatPage(page);
  await chat.goto();

  let requestCount = 0;
  await page.route("**/api/chat", async (route) => {
    requestCount++;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ reply: "ok", latencyMs: 200 }),
    });
  });

  await chat.input.fill("hello");

  // Two synchronous requestSubmit() calls, with no await in between, so
  // React never gets a chance to re-render the disabled button between the
  // two — a stronger stress test than two real, separate clicks.
  await page.evaluate(() => {
    const form = document.querySelector("form.composer") as HTMLFormElement;
    form.requestSubmit();
    form.requestSubmit();
    form.requestSubmit();
    form.requestSubmit();
  });

  await expect(chat.botMessages.last()).toBeVisible({ timeout: 10_000 });
  console.log("requestCount:", requestCount);
  expect(requestCount).toBe(1);
  await expect(chat.userMessages).toHaveCount(1);
});
