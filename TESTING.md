# Testing Strategy

This document describes the testing framework built on top of the base chatbot
app, and how it addresses both deterministic and non-deterministic behavior.

## Layers

| Layer | Target | Tooling | Status |
|---|---|---|---|
| Unit | Pure, isolated backend logic | Vitest | Implemented |
| API / contract | Backend HTTP behavior, error mapping | Vitest + Supertest | Implemented |
| E2E / UI | Chat flow through the browser | Playwright | Implemented |
| Non-deterministic | LLM response quality, relevance, consistency, hallucination risk | Playwright (planned) | Planned |

### Why API/contract tests use Supertest instead of Playwright

Playwright is used for the E2E/UI layer and will also drive the
non-deterministic evaluation layer, since both need a real browser and/or a
real model running. The API/contract layer uses Supertest instead, for two
reasons specific to this codebase:

- `createApp()` (`src/backend/app.ts`) accepts a `generate` override in its
  `AppOptions`. Supertest runs the Express app in-process, so contract tests
  inject a mock `generate` directly — no real Ollama instance, no server
  listening on a port, and every upstream error path (`429`, `502`, `503`,
  `504`) becomes a one-line mock instead of needing to make Ollama actually
  fail on demand.
- Playwright's `request` fixture always makes real network calls against a
  running server. Using it for contract tests would mean either depending on
  a live Ollama for error-path tests (not deterministic) or standing up a
  separate fake Ollama HTTP server as test infrastructure — extra moving
  parts that Supertest's in-process injection avoids entirely.

## A note on ownership: unit tests are a developer responsibility

Unit tests in this repository (`tests/unit/`) cover pure, isolated functions —
`validateMessage` (`src/backend/validation.ts`), `withTimeout`
(`src/backend/timeout.ts`), and `sendChat`'s error-message fallback logic
(`src/frontend/api.ts`, tested via a mocked `global.fetch` rather than a
browser, since the status-to-message mapping is pure logic that does not
need Playwright). They were written and are maintained as part of
this challenge submission, with AI-assisted tooling, to demonstrate coverage
of the deterministic side of the app as suggested by the challenge brief.

In a real team setting, **authoring and maintaining unit tests is the
responsibility of the developers who own the code**, not of the QA/testing
function. Unit tests are closest to the implementation, change every time the
implementation changes, and are cheapest to write and keep correct by whoever
is already inside that code. This is called out explicitly here so the
boundary is not blurred: the QA-owned layers of this framework are the API
contract tests, the end-to-end tests, and the non-deterministic evaluation
harness. Those are the layers that exercise the system from the outside, the
way a real user or a real integration would, and that is where an independent
test strategy adds the most value.

## Known API/contract defect (`tests/api/chat.test.ts`)

A `describe` block ("body-parser edge cases") pins down a confirmed contract
inconsistency rather than fixing it: an oversized request body (`413`) or
malformed JSON (`400`) never reach the application's own validation — they
are rejected by Express's body-parser middleware first, and returned as an
HTML error page instead of this API's usual `{ "error": string }` JSON
shape. `413` is also not documented anywhere in this app's README or OpenAPI
spec. These tests intentionally are not `test.fail()`: there is no clear
"desired" behavior for the test author to assert here, only the current,
real behavior (warts included), so a future change to it — whether an
intentional fix or an accidental regression — gets caught. Fixing the
underlying inconsistency or its documentation is a decision for whoever owns
the base app, not something patched by this testing framework. See
`RST-NOTES.md` #10 for how this was found and why the docs were not changed
here.

## E2E layer (`tests/e2e/`)

Covers the chat flow through a real browser, driven by Playwright, against
the real dev servers and the real local Ollama model:

- happy path: type a message, send it, see the user bubble, the loading
  indicator, and the bot reply appear.
- composer UX: the Send button stays disabled until there is non-whitespace
  text in the input.
- conversation history: two exchanges in a row both remain visible, in order.
- validation error surfaced to the user: a message over `MAX_MESSAGE_LENGTH`
  triggers the backend's 400 and the UI renders it as an alert, and the
  composer recovers (accepts input again) afterward.
- a previous error is cleared as soon as a new message is submitted, before
  the new reply arrives (not only once the response comes back).
- pressing Enter with an empty or whitespace-only composer submits nothing.
- (`test.fail()`, pending product decision) the composer should restore the
  original message when the request fails — it currently does not, since the
  input is cleared unconditionally before the request settles.
- (`test.fail()`, confirmed defect, pending a dev-team fix) two synchronous
  form submissions with no render in between both bypass the `loading`
  guard and reach the backend, producing two overlapping requests instead
  of one. See `RST-NOTES.md` #9 for how this was forced and why it happens.

`playwright.config.ts` starts `npm run dev` automatically (`webServer`), so
Ollama must already be running locally with the configured model pulled —
this layer is not mocked, unlike unit/API.

## Running the tests

```bash
npm install
npm run test:unit   # unit layer only (tests/unit)
npm run test:api    # API/contract layer only (tests/api)
npm run test        # unit + API layers
npm run test:watch  # watch mode, unit + API layers
npm run test:e2e    # E2E layer (tests/e2e), requires Ollama running locally
```

No running Ollama instance or backend server is required for the unit or the
API/contract layer: unit tests exercise pure functions with no I/O, and
API/contract tests run the Express app in-process via Supertest with a mocked
`generate` function. The E2E layer is the only one that talks to the real
model.
