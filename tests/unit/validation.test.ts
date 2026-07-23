import { describe, it, expect } from "vitest";
import { validateMessage, MAX_MESSAGE_LENGTH } from "../../src/backend/validation";

describe("validateMessage", () => {
  it("rejects non-string input", () => {
    const result = validateMessage(123);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("message must be a string");
  });

  it("rejects null and undefined", () => {
    expect(validateMessage(null).ok).toBe(false);
    expect(validateMessage(undefined).ok).toBe(false);
  });

  it("rejects an empty string", () => {
    const result = validateMessage("");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("message must not be empty");
  });

  it("rejects a string that is only whitespace", () => {
    const result = validateMessage("   \n\t  ");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("message must not be empty");
  });

  it("rejects a message longer than the max length", () => {
    const result = validateMessage("a".repeat(MAX_MESSAGE_LENGTH + 1));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(
        `message must be at most ${MAX_MESSAGE_LENGTH} characters`,
      );
    }
  });

  it("accepts a message exactly at the max length", () => {
    const message = "a".repeat(MAX_MESSAGE_LENGTH);
    const result = validateMessage(message);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(message);
  });

  it("trims surrounding whitespace from a valid message", () => {
    const result = validateMessage("  hello there  ");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe("hello there");
  });

  it("checks the length limit after trimming, not before", () => {
    const core = "a".repeat(MAX_MESSAGE_LENGTH);
    const result = validateMessage(`  ${core}  `);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(core);
  });

  // Known open question, not yet aligned with dev team — see RST-NOTES.md #1.
  // JS `.trim()` does not strip zero-width space (U+200B), so a message made
  // only of that character is currently accepted as non-empty and would be
  // sent to the model as an effectively invisible prompt. `it.fails` keeps
  // this documented and green until someone deliberately decides whether
  // this should be treated as empty.
  it.fails(
    "treats a message made only of zero-width spaces as empty (pending product decision)",
    () => {
      const zeroWidthSpace = String.fromCharCode(0x200b);
      const result = validateMessage(zeroWidthSpace.repeat(3));
      expect(result.ok).toBe(false);
    },
  );
});
