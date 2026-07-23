# Findings Report

This report lists defects found while building the testing framework for this
app. It is written for whoever owns or maintains the base application (dev
team, PM, or PO) — each entry includes plain-language reproduction steps, not
just a code reference, so it can be reproduced and triaged without reading the
test suite first.

This is a report of **what was found**, not a changelog of fixes applied.
None of these were patched as part of this testing work — see each entry's
"Why this wasn't fixed here" note.

---

## Summary

| # | Title | Severity | Area |
|---|---|---|---|
| 1 | Zero-width space bypasses "empty message" validation | Low | Backend validation |
| 2 | Message length limit counts UTF-16 units, not visible characters | Low | Backend validation |
| 3 | Composer discards the user's message when a request fails | Medium | Frontend UX |
| 4 | Rapid repeated submissions can send duplicate, overlapping requests | Medium–High | Frontend logic |
| 5 | Oversized/malformed request bodies return an inconsistent, undocumented error format | Medium | API contract |
| 6 | User message bubble fails WCAG 2 AA color contrast | Medium | Frontend accessibility |

---

## 1. Zero-width space bypasses "empty message" validation

**Severity:** Low
**Area:** Backend — `src/backend/validation.ts`

**Description:** The backend rejects messages that are empty or contain only
whitespace. However, the check uses JavaScript's `.trim()`, which does not
remove zero-width space characters (Unicode `U+200B`). A message made only of
these invisible characters is accepted as valid and forwarded to the model,
even though it looks identical to an empty message on screen.

**Steps to reproduce:**
1. Start the backend (`npm run dev:server` or `npm run dev`).
2. Send this request. The message body is 3 zero-width space characters
   (`U+200B`, UTF-8 bytes `e2 80 8b`), generated with `printf` and raw byte
   escapes so no invisible character has to be copy-pasted — a literal
   invisible character in a rendered document can silently get lost or
   altered when copied:
   ```bash
   curl -X POST http://localhost:3001/api/chat \
     -H "Content-Type: application/json" \
     -d "{\"message\": \"$(printf '\xe2\x80\x8b\xe2\x80\x8b\xe2\x80\x8b')\"}"
   ```
3. **Expected:** a `400` response, same as sending only regular spaces.
4. **Actual:** a `200` response — the message is accepted and sent to the
   model as if it had real content.

**Why this wasn't fixed here:** whether this should be rejected is a product
decision (what counts as "empty"?), not something this testing work should
decide unilaterally. It is documented as an automated test that is expected
to fail until a decision is made — see `tests/unit/validation.test.ts`
(search for `it.fails`).

**Recommendation:** decide whether `validateMessage` should strip or reject
zero-width/invisible characters, then remove the `it.fails` wrapper once
fixed.

---

## 2. Message length limit counts UTF-16 units, not visible characters

**Severity:** Low
**Area:** Backend — `src/backend/validation.ts`

**Description:** The 2000-character limit is enforced with
`string.length`, which counts UTF-16 code units, not visible characters.
Emoji and other characters outside the Basic Multilingual Plane take up 2
units each. A user typing about 1000 emoji (which looks like "1000
characters" to them) can be rejected for exceeding "2000 characters" at
roughly half the count they'd expect.

**Steps to reproduce:**
1. Send a message containing 1001 emoji characters (e.g. 🙂 repeated 1001
   times — visually ~1001 characters, but 2002 UTF-16 units):
   ```bash
   curl -X POST http://localhost:3001/api/chat \
     -H "Content-Type: application/json" \
     -d "{\"message\": \"$(python3 -c 'print("🙂"*1001)')\"}"
   ```
2. **Observed:** `400 message must be at most 2000 characters`, despite the
   message having far fewer than 2000 visible characters.

**Why this wasn't fixed here:** this is a product/UX question (is exact
character-counting accuracy worth the added complexity of grapheme-aware
counting, e.g. via `Intl.Segmenter`?), not a bug with an obvious correct
fix. No automated test enforces a specific behavior here; this is
documented as a known, current-behavior risk only.

**Recommendation:** decide whether the limit should count visible
characters (graphemes) instead of UTF-16 units, or whether the current
approximation is acceptable given the low likelihood of very long
emoji-heavy prompts in practice.

---

## 3. Composer discards the user's message when a request fails

**Severity:** Medium
**Area:** Frontend — `src/frontend/App.tsx`

**Description:** When a message is submitted, the input field is cleared
immediately, before the app knows whether the request will succeed or fail.
If the request fails for any reason (validation error, Ollama unavailable,
timeout), the text the user typed is gone — they must retype it from
scratch to try again.

**Steps to reproduce:**
1. Open the app in a browser (`npm run dev`, visit `http://localhost:5173`).
2. Type a message longer than 2000 characters into the composer (easiest
   reliable way to force a failure without stopping Ollama) — for example,
   paste a long block of repeated text.
3. Click **Send**.
4. **Expected:** the error appears, and the composer still contains (or
   restores) the message, so the user can shorten and resend it easily.
5. **Actual:** the error appears, but the composer is empty — the original
   text must be retyped.

**Why this wasn't fixed here:** restoring the text on failure is a UX
improvement, not a bug with one obviously correct fix — it is a product
decision. It is documented as an automated test expected to fail until a
decision is made — see `tests/e2e/chat.spec.ts` (search for
`restores the original message`).

**Recommendation:** decide whether the composer should preserve the
original text on failure (recommended for UX), then remove the
`test.fail()` wrapper once implemented.

---

## 4. Rapid repeated submissions can send duplicate, overlapping requests

**Severity:** Medium–High
**Area:** Frontend — `src/frontend/App.tsx`

**Description:** The Send button and the submit handler both guard against
double-submission using React's `loading` state. This guard depends on
React having re-rendered the component (to flip `loading` to `true`)
between two submission attempts. When two submissions happen
back-to-back with no render in between, both attempts read `loading` as
still `false`, and both are sent to the backend — producing duplicate
requests to the local model for what the user intended as a single message.
In our testing, forcing 4 rapid submissions produced 4 separate backend
requests, not 1.

**Steps to reproduce (requires a script; not reliably reproducible by hand
since human clicks are too far apart in time to trigger this reliably):**
1. Open the app in a browser and open the DevTools console.
2. Type a message into the composer.
3. In the console, run:
   ```js
   const form = document.querySelector("form.composer");
   form.requestSubmit();
   form.requestSubmit();
   ```
4. **Expected:** only one request reaches the backend; only one user
   message bubble appears.
5. **Actual:** both submissions go through — two requests, two user message
   bubbles, two bot replies for a single intended message.

**Automated reproduction:** `tests/e2e/chat.spec.ts` (search for
`does not allow a second submission to overlap`) forces this deterministically
and counts real backend requests via network interception.

**Why this wasn't fixed here:** the fix requires changing production
frontend logic (e.g. guarding with an immediate ref/flag instead of relying
solely on React state timing), which is outside the scope of this testing
work. This is documented as an automated test expected to fail until a fix
is made.

**Recommendation:** add a synchronous guard (e.g. a `useRef` flag set
immediately on submit, checked before any state update) so the block does
not depend on a render happening in time.

---

## 5. Oversized/malformed request bodies return an inconsistent, undocumented error format

**Severity:** Medium
**Area:** Backend — `src/backend/app.ts`, API contract/documentation

**Description:** Every documented error response from this API (`400`,
`429`, `502`, `503`, `504`) is a JSON body shaped like
`{ "error": "<message>" }`. This holds true when the app's own validation
rejects a request. However, two cases never reach the app's validation at
all, because Express's body-parsing middleware (`express.json({ limit:
"32kb" })`) rejects them first:

- A request body larger than 32kb returns `413`, as an **HTML** error page
  (Express's default), not the API's usual JSON shape.
- A request with syntactically invalid JSON returns `400`, also as an
  **HTML** error page — the same status code (`400`) that the app's own
  validation uses for a JSON response, but with a completely different body
  format.

Additionally, `413` is not mentioned anywhere in this project's README or
OpenAPI spec, so any API consumer relying on that documentation has no way
to know this response is possible.

**Steps to reproduce:**
1. Start the backend.
2. Oversized body:
   ```bash
   curl -i -X POST http://localhost:3001/api/chat \
     -H "Content-Type: application/json" \
     -d "{\"message\": \"$(python3 -c 'print("a"*40000)')\"}"
   ```
   **Observed:** `HTTP/1.1 413 Payload Too Large`, body is an HTML page, not
   JSON.
3. Malformed JSON:
   ```bash
   curl -i -X POST http://localhost:3001/api/chat \
     -H "Content-Type: application/json" \
     -d '{not valid json'
   ```
   **Observed:** `HTTP/1.1 400 Bad Request`, body is an HTML page, not the
   `{ "error": ... }` shape the same `400` status uses everywhere else in
   this API (e.g. for a missing `message` field).

**Why this wasn't fixed here:** fixing this would mean either changing
application code (adding a custom error-handling middleware to normalize
these responses to JSON) or updating the README/OpenAPI spec — both are
changes to the base application/its documentation, not to the testing
framework built on top of it. This is documented as passing automated tests
that pin down the current (inconsistent) behavior as-is — see
`tests/api/chat.test.ts` (search for `body-parser edge cases`) — so that
any future change to this behavior, intentional or not, is caught.

**Recommendation:** add a custom JSON error-handling middleware so all
non-2xx responses share the same `{ "error": string }` shape, and document
`413` as a possible response in the README and OpenAPI spec.

---

## 6. User message bubble fails WCAG 2 AA color contrast

**Severity:** Medium
**Area:** Frontend — `src/frontend/styles.css`

**Description:** The blue chat bubble used for the user's own messages
(`.msg-user { background: #2b5cff; }`) does not have enough contrast
between its background and its text color to meet the WCAG 2 AA minimum
(4.5:1 for normal text). This makes the user's own messages harder to read
than intended for anyone with low vision, and fails a widely-used
accessibility standard outright.

**Steps to reproduce:**
1. Open the app in a browser (`npm run dev`, visit `http://localhost:5173`).
2. Send any message (e.g. "Say hello in one short sentence.").
3. Open browser DevTools, inspect the blue message bubble you just sent
   (the `<li class="msg msg-user">` element) and its "You" label
   (`<span class="msg-label">`).
4. Most browsers' DevTools show a contrast warning directly in the color
   picker for the `color` property when the ratio is insufficient — or
   run an automated scan (see below).

**Automated reproduction:** `tests/e2e/accessibility.spec.ts` runs
[axe-core](https://github.com/dequelabs/axe-core) (the industry-standard
automated accessibility scanner) against the page after a message exchange.
It reports two violations on the same `.msg-user` bubble:
- The "You" label: **2.45:1** contrast ratio (needs 4.5:1).
- The message text itself: **4.23:1** contrast ratio (needs 4.5:1).

Both are under the WCAG 2 AA threshold. The label is worse because
`.msg-label` also has `opacity: 0.6` applied in `styles.css`, which further
lightens its effective color against the background.

**Why this wasn't fixed here:** the fix is a color change to
`src/frontend/styles.css` (the base app's styling), not a change to the
testing framework built on top of it — the same scope boundary applied to
every other confirmed defect in this report. This is documented as an
automated test expected to fail (`test.fail()` in
`tests/e2e/accessibility.spec.ts`) rather than silently left unmeasured, so
the suite still notices if the contrast is fixed (the test would then fail
in the other direction, since it's marked as expected-to-fail) or if it
gets worse.

**Recommendation:** darken `.msg-user`'s background or lighten its text
color (and remove or reduce the `.msg-label` opacity within that bubble) to
reach at least a 4.5:1 contrast ratio, then remove the `test.fail()` wrapper.
