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

### Additional API coverage: CORS and concurrency

- **`cors.test.ts`** — pins down that `app.use(cors())` (no options) returns
  `Access-Control-Allow-Origin: *`, allowing any origin. Fine for a
  local-only dev tool, but worth having on record as a real risk if this
  code is ever deployed as-is elsewhere.
- **`concurrency.test.ts`** — fires several `POST /api/chat` requests at
  once, with a mock `generate` that finishes in random order, and asserts
  each response still matches its own request. `app.ts` has no shared
  mutable state between requests, so this should always pass — the test
  exists to prove that claim rather than leave it assumed, and to catch a
  future regression (e.g. an accidental module-level variable) that would
  make responses cross-talk between concurrent requests.

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

Uses a small Page Object (`chat-page.ts`) to centralize the chat UI's
selectors and the common "type + send" action, so individual tests read at
the level of user intent instead of repeating locators — a selector change
(e.g. the `message` accessible label) only needs updating in one place, not
in every test. `chat-page.ts` has no `test(...)` calls, so Playwright never
picks it up as a spec file on its own.

Covers the chat flow through a real browser, driven by Playwright, against
the real dev servers and the real local Ollama model:

- happy path: type a message, send it, see the user bubble, the loading
  indicator, and the bot reply appear.
- composer UX: the Send button stays disabled until there is non-whitespace
  text in the input.
- conversation history: two exchanges in a row both remain visible, in
  order, plus a 5-exchange version to catch anything that only shows up
  with a longer history (off-by-one indexing, rendering with more DOM
  nodes) that the 2-exchange case wouldn't.
- validation error surfaced to the user: a message over `MAX_MESSAGE_LENGTH`
  triggers the backend's 400 and the UI renders it as an alert, and the
  composer recovers (accepts input again) afterward.
- a previous error is cleared as soon as a new message is submitted, before
  the new reply arrives (not only once the response comes back).
- pressing Enter with an empty or whitespace-only composer submits nothing.
- a message containing HTML/script markup renders as literal text, not a
  real element — React's JSX interpolation escapes it, since `App.tsx` never
  uses `dangerouslySetInnerHTML`.
- (`test.fail()`, pending product decision) the composer should restore the
  original message when the request fails — it currently does not, since the
  input is cleared unconditionally before the request settles.
- (`test.fail()`, confirmed defect, pending a dev-team fix) two synchronous
  form submissions with no render in between both bypass the `loading`
  guard and reach the backend, producing two overlapping requests instead
  of one. See `docs/FINDINGS.md` for the full write-up and reproduction
  steps.

### Accessibility (`accessibility.spec.ts`)

Scans the page with [axe-core](https://github.com/dequelabs/axe-core) (via
`@axe-core/playwright`), the industry-standard automated accessibility
checker, both on initial load and after a real message exchange (so the
dynamically-rendered bubbles are covered too). The initial-load scan passes
clean. The post-exchange scan is `test.fail()`: it found a real, confirmed
WCAG 2 AA color-contrast violation on the user's message bubble — see
`docs/FINDINGS.md` #6 for the exact numbers and why it wasn't patched here.
Automated scanning like this only catches objective, rule-based violations;
it cannot confirm a screen reader announces the loading/error live regions
correctly, only that the markup isn't broken in a way that would prevent it.

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

A shared helper, `chat-client.ts`, centralizes the repeated "post a message,
assert the request succeeded, return the reply text" pattern every eval
test needs (`sendChat(request, message)`). Like `chat-page.ts` in the E2E
layer, it has no `test(...)` calls, so Playwright never treats it as a spec
file on its own.

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

- **`relevance.spec.ts`** — factual questions with checkable answers;
  asserts the expected keyword appears in the reply (e.g. "Paris" for "what
  is the capital of France"). Covers three different questions (breadth —
  not just one possibly-memorized trivia fact), plus a separate test that
  runs the same question 5 times and requires at least 4 passes rather than
  a single pass/fail: the standard way to evaluate a probabilistic system
  without over-trusting one lucky run or failing the suite over one unlucky
  one. Playwright has no `test.each` (unlike Jest/Vitest), so the breadth
  cases are generated with a plain loop calling `test()` at module load
  time, which is the idiomatic Playwright pattern for this.
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

### Known limits of this eval layer, and what a more mature version would add

This is a starting point, not a production-grade evaluation harness. Being
explicit about the gap:

- **Prompt breadth is still small.** A handful of prompts per category is
  enough to demonstrate the technique and catch gross regressions, but a
  mature harness would cover many more prompts per category, ideally
  organized as versioned test-data files rather than inline literals.
- **No quality-drift tracking over time.** Every run here is independent —
  nothing records today's pass rate to compare against last week's. A
  production setup would persist eval results (pass rate per category, per
  model version) somewhere queryable, so a silently-degrading model update
  or prompt change shows up as a trend, not just a one-off local failure.
  That's a small infrastructure project on its own (a results store plus a
  place to view it) and deliberately out of scope here — worth flagging as
  a recommendation rather than quietly leaving unmentioned.
- **The majority-vote pattern (`relevance.spec.ts`) is applied to one
  category, not all four.** It's the right technique for `format` and
  `hallucination` too, in principle; it wasn't extended everywhere here to
  keep the total eval suite runtime reasonable, since each repeat is a real
  call to the local model.

## Continuous integration

There are no PRs on this fork (it's a solo submission), so the usual
push/PR-triggered CI doesn't apply the way it would on a team repo. Instead,
`.github/workflows/scheduled-tests.yml` runs all 4 layers on a schedule:
4 times a day (05:00, 06:00, 07:00, 08:00 Brasília time / 08:00–11:00 UTC),
for a 60-day window enforced by an explicit date check in a `gate` job
(GitHub Actions cron has no built-in expiry, and the platform's own
60-days-of-repo-inactivity auto-disable is a different, unrelated
mechanism). It can also be triggered manually via `workflow_dispatch`.

**Why a container instead of installing Ollama fresh on every run:**
downloading the ~1.9GB default model 4 times a day for 60 days is real,
avoidable bandwidth and time. `docker/ollama.Dockerfile` extends the
official `ollama/ollama` image and pre-pulls `qwen2.5:3b-instruct` at
*build* time; `.github/workflows/build-ollama-image.yml` builds and
publishes it to GHCR (`ghcr.io/<owner>/chatbot-ollama:qwen2.5-3b-instruct`)
whenever the Dockerfile changes, or on demand. The scheduled workflow uses
that image as a `services:` container, so the model is already present the
moment the container starts — no pull step needed at test time.

**This was verified end-to-end on GitHub's actual infrastructure, not just
configured and assumed to work:** both workflows were triggered manually
(`workflow_dispatch`) once each. The image build succeeded in 5m41s; the
full scheduled test run then completed in 3m47s, with the `gate` job
correctly evaluating the expiry date and the `test` job passing unit, API,
E2E, and eval layers against the real Ollama service container.

## Running the tests

```bash
npm install
npx playwright install chromium   # one-time browser download, only needed for test:e2e / test:eval
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
