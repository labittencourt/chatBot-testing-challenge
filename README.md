# Local LLM Chatbot Challenge App (Ollama)

Minimal chatbot web app running fully local through Ollama.

The repository is intentionally small so it can be used as the base application
for a testing challenge focused on deterministic and non-deterministic behavior
without depending on cloud LLM quotas.

## Purpose

This repository provides a clean app baseline for testers.

It is not a testing framework. The candidate is expected to build the testing
strategy and tooling on top of this app in a fork or in a derived repository.

## Architecture

The application has two runtime parts:

- React frontend served by Vite.
- Express backend that calls a local Ollama model.

During local development:

- Frontend runs on `http://localhost:5173`.
- Backend runs on `http://localhost:3001`.
- Frontend requests to `/api/*` are proxied to backend.

### Request flow

1. User types a message in the frontend.
2. Frontend sends `POST /api/chat` with `{ "message": "..." }`.
3. Backend validates the payload.
4. Backend calls Ollama `POST /api/generate` (local).
5. Backend returns `{ "reply": "...", "latencyMs": number }`.
6. Frontend renders the assistant response.

## Tech stack

| Layer | Technology |
| ---- | ---- |
| Frontend | React 18, TypeScript, Vite |
| Backend | Node.js, Express, TypeScript |
| LLM integration | Ollama local HTTP API |
| Runtime config | dotenv |

## Project structure

```text
.
├── src/
│   ├── backend/
│   │   ├── app.ts
│   │   ├── config.ts
│   │   ├── ollama.ts
│   │   ├── openapi.ts
│   │   ├── server.ts
│   │   ├── timeout.ts
│   │   └── validation.ts
│   └── frontend/
│       ├── api.ts
│       ├── App.tsx
│       ├── index.html
│       ├── main.tsx
│       └── styles.css
├── tests/                  # testing framework (this fork's addition)
│   ├── unit/                 # Vitest — pure logic, no I/O
│   ├── api/                   # Vitest + Supertest — backend contract, generate() mocked
│   ├── e2e/                    # Playwright — real browser, real Ollama
│   └── eval/                    # Playwright — non-deterministic LLM quality checks
├── docs/
│   └── FINDINGS.md         # defects found, with reproduction steps (this fork's addition)
├── .env.example
├── .npmrc
├── package.json
├── playwright.config.ts    # this fork's addition
├── tsconfig.json
├── tsconfig.build.json
├── TESTING.md              # this fork's addition — full testing strategy
├── vite.config.ts
└── vitest.config.ts        # this fork's addition
```

## Backend

The backend entry point is `src/backend/server.ts`. It creates the Express app
from `src/backend/app.ts` and starts listening on the configured port.

### Backend responsibilities

- Parse JSON requests.
- Enable CORS for the frontend.
- Validate incoming chat messages.
- Enforce timeout budget for local model calls.
- Translate Ollama failures into API-friendly HTTP responses.

### Endpoints

#### `GET /api/openapi.json`

Returns the OpenAPI specification in JSON format for the backend services.

#### `GET /api/docs`

Serves Swagger UI for interactive backend API documentation and testing.

#### `GET /api/health`

Health endpoint to verify backend status.

Example response:

```json
{
  "status": "ok",
  "model": "qwen2.5:3b-instruct"
}
```

#### `POST /api/chat`

Accepts user message and returns model response.

Request body:

```json
{
  "message": "Explain what an LLM is in simple terms"
}
```

Successful response:

```json
{
  "reply": "An LLM is a model trained to understand and generate language...",
  "latencyMs": 842
}
```

Possible error responses:

- `400` when `message` is missing, empty, not a string, or too long.
- `429` when upstream model/provider rate limit is reached.
- `503` when local model service is unavailable (for example Ollama not running).
- `502` for upstream failures that do not map to a specific status.
- `504` when the model exceeds timeout budget.

### API docs (Swagger UI)

When backend is running, API documentation is available at:

- `http://localhost:3001/api/docs` (interactive Swagger UI)
- `http://localhost:3001/api/openapi.json` (raw OpenAPI spec)

Use Swagger UI to test backend services:

1. Open `http://localhost:3001/api/docs`.
2. Expand `GET /api/health` and click **Try it out** then **Execute**.
3. Expand `POST /api/chat`, click **Try it out**, set request body:

```json
{
  "message": "Say hello in one short sentence."
}
```

4. Click **Execute** and review status code + response body.

### Backend modules

- `src/backend/app.ts`: Express app and route handling.
- `src/backend/server.ts`: backend bootstrap.
- `src/backend/config.ts`: environment variable loading and defaults.
- `src/backend/ollama.ts`: Ollama HTTP client and response parsing.
- `src/backend/validation.ts`: input validation rules.
- `src/backend/timeout.ts`: generic timeout wrapper.

## Frontend

The frontend is intentionally minimal.

### Frontend responsibilities

- Render chat interface.
- Keep message history in memory.
- Send requests to backend.
- Display loading and error states.

### Frontend modules

- `src/frontend/App.tsx`: main chat UI and state management.
- `src/frontend/api.ts`: wrapper around `/api/chat`.
- `src/frontend/main.tsx`: React bootstrap.
- `src/frontend/index.html`: Vite HTML entry.
- `src/frontend/styles.css`: base styles.

## Configuration

The app reads runtime settings from environment variables.

| Variable | Required | Description |
| ---- | ---- | ---- |
| `OLLAMA_BASE_URL` | No | Ollama base URL. Default: `http://localhost:11434`. |
| `OLLAMA_MODEL` | No | Local model tag to use. Default: `qwen2.5:3b-instruct`. |
| `PORT` | No | Backend port. Default: `3001`. |
| `REQUEST_TIMEOUT_MS` | No | Timeout budget per model request. Default: `20000`. |

## Prerequisites

Before running the app, make sure you have:

- Node.js 20 or newer.
- npm available in your environment.
- Ollama installed locally.

## Install Ollama (macOS, Linux, Windows)

### macOS

1. Install from https://ollama.com/download.
2. Launch Ollama.
3. Verify:

```bash
ollama --version
```

### Linux

1. Install from https://ollama.com/download/linux.
2. Start service (if needed):

```bash
sudo systemctl start ollama
```

3. Verify service/API:

```bash
curl -s http://localhost:11434/api/tags
```

### Windows

1. Install from https://ollama.com/download/windows.
2. Open Ollama app (or start service from installed shortcut).
3. Verify in PowerShell:

```powershell
ollama --version
```

## Choose and pull a local model

After installing Ollama, pull one model before starting the app.

Recommended small models for lower-resource laptops:

- `qwen2.5:3b-instruct` (default in this repo)
- `phi3:mini`
- `gemma2:2b`

Example:

```bash
ollama pull qwen2.5:3b-instruct
```

You can check downloaded models with:

```bash
ollama list
```

## Environment setup

Create your local environment file:

```bash
cp .env.example .env
```

Default `.env` values are already local-only and free to run:

```env
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:3b-instruct
PORT=3001
REQUEST_TIMEOUT_MS=20000
```

If you pulled a different model, update `OLLAMA_MODEL` accordingly.

`.env` is ignored by Git and must not be committed.

## Install dependencies

```bash
npm install
```

The repository includes `.npmrc` pointing to the public npm registry.

## Run the app

### Start frontend and backend together

```bash
npm run dev
```

This starts:

- backend on `http://localhost:3001`
- frontend on `http://localhost:5173`

Open `http://localhost:5173` in your browser.

### Manual verification after startup

1. Confirm Ollama is running and model exists:

```bash
ollama list
```

2. Open `http://localhost:5173`.
3. Type a simple prompt (example: `Say hello in one short sentence.`).
4. Click **Send**.
5. Confirm a bot response appears in the UI.

If no response appears:

- Verify Ollama is running.
- Verify `OLLAMA_MODEL` exists in `ollama list`.
- Check backend logs for `503`, `502`, or `504`.

### Start only the backend

```bash
npm run dev:server
```

### Start only the frontend

```bash
npm run dev:web
```

## Build and run in production mode

Create frontend bundle:

```bash
npm run build
```

Start backend runtime:

```bash
npm run start
```

## Low-resource machine recommendations

If the computer is slow or has limited RAM:

- Prefer 2B to 3B models (`gemma2:2b`, `qwen2.5:3b-instruct`, `phi3:mini`).
- Keep prompts short.
- Increase `REQUEST_TIMEOUT_MS` if timeouts are frequent.
- Avoid running other heavy processes in parallel.

This setup is still valid for the challenge because the focus is testing strategy,
not peak model quality.

## Operational notes

- LLM responses are non-deterministic by nature.
- Local models may vary in quality depending on model size and hardware.
- `503` usually indicates Ollama service is not reachable.
- `504` indicates the model exceeded timeout budget.
- `429` may appear depending on provider/model behavior or middleware constraints.

These behaviors are part of the app reality and are relevant for API, UI, and
non-deterministic testing scenarios.

## Testing Solution

This fork adds a testing framework on top of the base app described above.
Full details (layer-by-layer rationale, tradeoffs, and what each test file
does) are in [`TESTING.md`](TESTING.md). Confirmed defects and open product
questions found while testing are in [`docs/FINDINGS.md`](docs/FINDINGS.md),
written with plain-language reproduction steps for a non-technical reviewer.

### What was implemented, and why

Four layers, each targeting a different kind of risk in an LLM chatbot app:

| Layer | Covers | Tooling | Needs Ollama running? |
| ---- | ---- | ---- | ---- |
| Unit (`tests/unit/`) | Pure, isolated logic — input validation, timeout wrapper, frontend error-message mapping | Vitest | No |
| API / contract (`tests/api/`) | Backend HTTP behavior and error mapping (`400`/`429`/`502`/`503`/`504`) | Vitest + Supertest | No — `generate` is mocked in-process |
| E2E / UI (`tests/e2e/`) | Chat flow through a real browser: composer UX, conversation history, error display, edge-case races | Playwright | Yes |
| Non-deterministic (`tests/eval/`) | LLM response quality: relevance, format adherence, consistency, hallucination risk | Playwright | Yes |

Unit and API/contract tests never touch Ollama — they run in-process or with
a mocked model call, so they're fast and fully deterministic. E2E and
non-deterministic tests run against the real dev servers and the real local
model, because that's the only way to test what a real user (or a real
model response) actually does.

### How non-deterministic behavior was handled

The core problem with testing an LLM's output is that there is no exact
"correct" answer to assert against — the same prompt returns different
wording every time by design. `tests/eval/` addresses this with heuristic
checks instead of exact-match assertions:

- **Relevance**: a factual question with a checkable answer; asserts the
  expected keyword appears in the reply.
- **Format adherence**: asks for "one short sentence" and checks the reply
  stays under a length ceiling, rather than turning into an essay.
- **Consistency**: sends the same prompt 5 times and checks three angles —
  reply lengths don't vary wildly from each other, all replies stay on
  topic (keyword-based), and the model itself is used as a judge of whether
  all 5 replies convey the same core idea (LLM-as-judge).
- **Hallucination guardrail**: a factual yes/no question with an objectively
  wrong answer; asserts the model doesn't confidently affirm it.

These checks are inherently probabilistic — a heuristic can occasionally
fail even when the app is working correctly, just because the model phrased
something unusually that one time. This was observed directly during
development: the LLM-as-judge check failed 1 time in 8 runs (~12.5%) against
the default model (`qwen2.5:3b-instruct`), which is why that specific test
has retries configured (`test.describe.configure({ retries: 2 })`) — the
standard way to handle a probabilistic check without masking a consistently
wrong result. See `TESTING.md` for the full reasoning and the raw data
behind each heuristic's threshold.

### Running the tests

```bash
npm install
npx playwright install chromium   # one-time browser download, only needed for test:e2e / test:eval
npm run test:unit   # unit layer (tests/unit) — no Ollama needed
npm run test:api    # API/contract layer (tests/api) — no Ollama needed
npm run test        # unit + API layers together
npm run test:e2e    # E2E layer (tests/e2e) — requires Ollama running with the configured model
npm run test:eval   # non-deterministic layer (tests/eval) — requires Ollama running with the configured model
```

### Known defects and open questions

Five findings from this testing work are written up with reproduction steps
in [`docs/FINDINGS.md`](docs/FINDINGS.md): two backend validation edge cases
(zero-width space, UTF-16 vs. visible character counting), a frontend UX gap
(the composer discards the user's message on a failed request), a confirmed
frontend race (rapid repeated submissions can send duplicate requests), and
an inconsistent/undocumented API error format for oversized or malformed
request bodies. None were patched as part of this work — each entry
explains why (either a product decision this testing work shouldn't make
unilaterally, or a change to the base app outside this framework's scope)
and links to the automated test that documents it.

### AI-assisted development

This testing framework, its documentation, and this README section were
built with AI-assisted tooling (Claude Code), as encouraged by the original
challenge brief — used for designing the test layering, writing test cases,
and reviewing the test suite itself for gaps using a Rapid Software Testing
(RST) mindset, which is how findings like the frontend race condition and
the API's inconsistent error format were found.

## Challenge instructions

This repository is the base app for a testing challenge.

### Goal

Build a testing framework around this chatbot application. The solution should
cover both deterministic and non-deterministic LLM behavior.

### Expected approach

The candidate should create either:

- a fork of this repository, or
- a separate repository containing the app plus the testing framework.

### Suggested testing scope

Suggested areas:

- unit tests for isolated logic and utility behavior
- API tests for backend contracts and error handling
- UI or end-to-end tests for chat flow
- non-deterministic tests for quality, relevance, consistency, and hallucination risk

### Use of AI tools

The challenge encourages AI-assisted tooling to:

- design framework structure
- generate test cases
- generate test data and prompt sets
- propose assertions and evaluation strategies
- improve documentation and maintenance

### Deliverables

The candidate should provide:

1. URL of fork/derived repository with solution.
2. Clear setup instructions.
3. Clear commands to execute tests.
4. Documentation of strategy, coverage, assumptions, and tradeoffs.

### README expectations for candidate solution

Candidate should either:

- rewrite this README to include testing solution, or
- extend it with a dedicated testing section.

Documentation should explain what was implemented, why, how to run it, and how
non-deterministic behavior was handled.

## Review checklist

When reviewing candidate solution, verify:

- app still runs locally
- framework is easy to install and execute
- strategy matches LLM chatbot characteristics
- deterministic vs non-deterministic checks are clearly separated
- README is clear and reproducible
- shared repository can be executed by another reviewer
