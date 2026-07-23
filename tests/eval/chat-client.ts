import { expect, type APIRequestContext } from "@playwright/test";

// Shared helper for the eval layer: posts a message to the real backend
// (never mocked here — this layer evaluates the real model's output) and
// returns the reply text, asserting the request itself succeeded so every
// eval test doesn't have to repeat that check.
export async function sendChat(
  request: APIRequestContext,
  message: string,
): Promise<string> {
  const res = await request.post("/api/chat", { data: { message } });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  return body.reply as string;
}
