import type { Locator, Page } from "@playwright/test";

// Page Object for the chat UI. Centralizes the selectors and the common
// "type + send" action so individual tests read at the level of user intent
// instead of repeating locators and low-level steps.
export class ChatPage {
  readonly page: Page;
  readonly input: Locator;
  readonly sendButton: Locator;
  readonly status: Locator;
  readonly alert: Locator;
  readonly userMessages: Locator;
  readonly botMessages: Locator;

  constructor(page: Page) {
    this.page = page;
    this.input = page.getByLabel("message");
    this.sendButton = page.getByRole("button", { name: "Send" });
    this.status = page.getByRole("status");
    this.alert = page.getByRole("alert");
    this.userMessages = page.locator(".msg-user");
    this.botMessages = page.locator(".msg-bot");
  }

  async goto() {
    await this.page.goto("/");
  }

  async sendMessage(message: string) {
    await this.input.fill(message);
    await this.sendButton.click();
  }
}
