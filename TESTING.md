# Testing Strategy

This document describes the testing framework built on top of the base chatbot
app, and how it addresses both deterministic and non-deterministic behavior.

## Layers

| Layer | Target | Tooling | Status |
|---|---|---|---|
| Unit | Pure, isolated backend logic | Vitest | Implemented |
| API / contract | Backend HTTP behavior, error mapping | Vitest + Supertest | Implemented |
| E2E / UI | Chat flow through the browser | Playwright | Implemented |
| Non-deterministic | LLM response quality, relevance, consistency, hallucination risk | Playwright | Implemented |

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
`docs/FINDINGS.md` for the full write-up, reproduction steps, and
recommendation.

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
  of one. See `docs/FINDINGS.md` for the full write-up and reproduction
  steps.

`playwright.config.ts` starts `npm run dev` automatically (`webServer`), so
Ollama must already be running locally with the configured model pulled —
this layer is not mocked, unlike unit/API.

## Non-deterministic layer (`tests/eval/`)

Hits the backend directly via Playwright's `request` fixture (no browser —
a second Playwright project, `eval`, configured in `playwright.config.ts`
with its own `baseURL` pointing at the backend). This is the only layer
where the real Ollama model's output is actually evaluated; every other
layer either mocks `generate` or only cares that *some* reply renders,
never what it says.

**This layer is fundamentally different from the other three, and that
difference has to stay visible, not just implied by folder name:**

- Unit, API, and E2E tests use `expect(x).toBe(y)` — an exact, deterministic
  oracle. A test that passes once will pass every time, given the same code.
- Eval tests use heuristics — weaker, approximate checks — because the
  model's exact wording is different on every call by design. A test here
  can occasionally fail even when the app is working correctly, just
  because the model phrased something unusually that one time. Flakiness in
  this layer is not automatically a bug in the app or the test, the way it
  would be in the other three layers.

Four categories, one test file each:

- **`relevance.spec.ts`** — a factual question with a checkable answer;
  asserts the expected keyword appears in the reply (e.g. "Paris" for "what
  is the capital of France").
- **`format.spec.ts`** — asks for "one short sentence" and asserts the
  reply stays under a heuristic length ceiling, rather than turning into an
  essay.
- **`consistency.spec.ts`** — sends the same prompt 5 times and checks
  consistency from three different angles, each catching something the
  others cannot:
  - **Length consistency**: per-call invariants (never empty, never
    unboundedly long) *and* that the 5 calls are consistent with each
    other (no reply's length wildly larger or smaller than the others,
    within a generous ratio). Checking only the per-call invariants would
    not actually test consistency — two replies could each individually
    satisfy a loose absolute ceiling while being wildly different in size
    from each other.
  - **Topic consistency (cheap)**: all 5 replies contain a topic-relevant
    keyword (e.g. "language", "model"). Length consistency alone says
    nothing about whether the replies are actually about the same thing —
    this catches the model wandering off-topic on some calls, without
    needing to understand meaning.
  - **Core-idea consistency (expensive, LLM-as-judge)**: the model itself
    is asked whether all 5 replies convey the same core idea, even if
    worded completely differently — something a keyword check cannot
    verify. This costs an extra model call, and its own judgment is just as
    non-deterministic as the thing it's judging: during development it
    failed 1 time in 8 runs (~12.5%), with the small 3B judge answering
    "no" for replies that were, on inspection, clearly conveying the same
    idea. This test is wrapped in `test.describe.configure({ retries: 2 })`
    — the standard way to handle a probabilistic check like this: an
    isolated bad judgment gets retried and shows up as "flaky" rather than
    failing the suite, while a *consistently* wrong judgment still would.
    This was verified in practice, not just configured on faith: a real run
    during development failed on the first attempt and passed on retry,
    and Playwright reported it as "1 flaky" with exit code 0.
- **`hallucination.spec.ts`** — a factual yes/no question with an
  objectively wrong answer ("is 2 + 2 equal to 5?"); asserts the model
  doesn't confidently affirm it. The check accepts either an explicit "no"
  or the correct number ("4"/"four") as a valid denial, since the model
  isn't guaranteed to use the literal word "no" — a reply like "it's 4, not
  5" is just as correct and should not be flagged as a failure. This is a
  narrow guardrail against one specific failure mode, not a general
  hallucination detector.

All 6 tests were run repeatedly against `qwen2.5:3b-instruct` throughout
development as a baseline stability check before considering them part of
the suite. Every test except the LLM-as-judge one passed consistently
across all runs; the judge test's one observed failure (out of 8 runs) is
discussed above, and is the reason it — and only it — has retries
configured. A heuristic passing consistently in local testing is not a
guarantee it
always will; periodic re-verification is expected for this layer in a way
it is not for the deterministic ones. The oracles were also checked against
raw model output (not just through the app) during development — for
example, the "no"-only version of the hallucination check would have missed
a correct answer phrased as "it's 4, not 5", even though 8/8 manual runs
against the default model happened to reply with a literal "No" — the
looser check protects against that phrasing risk even though it wasn't
observed occurring in practice.

## Running the tests

```bash
npm install
npm run test:unit   # unit layer only (tests/unit)
npm run test:api    # API/contract layer only (tests/api)
npm run test        # unit + API layers
npm run test:watch  # watch mode, unit + API layers
npm run test:e2e    # E2E layer (tests/e2e), requires Ollama running locally
npm run test:eval   # non-deterministic layer (tests/eval), requires Ollama running locally
```

No running Ollama instance or backend server is required for the unit or the
API/contract layer: unit tests exercise pure functions with no I/O, and
API/contract tests run the Express app in-process via Supertest with a mocked
`generate` function. The E2E and non-deterministic layers are the only ones
that talk to the real model.
