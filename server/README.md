# Life Simulator backend

Fastify + TypeScript API for the Moving Workspace. The backend package is independent so the frontend agent can choose its build tools without a package configuration conflict. Shared contracts live in `shared/contracts/index.ts`.

## Run

Requires Node.js 22 or later.

```sh
npm --prefix shared/contracts ci
npm --prefix server ci
cp server/.env.example server/.env
cd server
npm run dev
```

The default URL is `http://127.0.0.1:3001`. `npm start` starts without watching. `npm run build`, `npm run typecheck`, and `npm test` run the backend checks. To run compiled output after a build: `node --env-file-if-exists=.env dist/server/src/index.js` from `server/`.

```sh
curl http://127.0.0.1:3001/api/health
curl -X POST http://127.0.0.1:3001/api/projects \
  -H 'Content-Type: application/json' \
  -d '{"message":"I am moving to Turku next month with a budget of 2000 euros","locale":"en"}'
```

Use the returned project ID for research, cart, scenario, risk and workspace requests. [Frontend handoff](docs/FRONTEND_HANDOFF.md) lists every route, exact response envelopes, widget types, examples, financial conventions and the confirmation endpoint. Request/response schemas and inferred types are exported by the shared contract.

## Modes and environment

| Variable | Default | Purpose |
|---|---|---|
| HOST / PORT | 127.0.0.1 / 3001 | Listen address; shared API token required outside loopback |
| OPENAI_API_KEY | absent | Server-only OpenAI credentials |
| OPENAI_MODEL | gpt-6.1-sol | Planning and research model; availability depends on account |
| AI_MODE | openai with key, otherwise local | Structured model planning or deterministic local template/parser |
| RESEARCH_MODE | live with key, otherwise unavailable | live, unavailable, or explicitly fictional demo offers |
| STORAGE_MODE | local | Atomic local JSON files or memory |
| DATA_DIR | data | Directory relative to the server process working directory |
| API_TOKEN | absent | Optional shared deployment token, minimum 24 characters |
| ALLOWED_ORIGINS | localhost:5173, 127.0.0.1:5173, localhost:3000 HTTP origins | Exact comma-separated browser origins |
| AI_TIMEOUT_MS | 60000 | Model deadline |
| RESEARCH_TIMEOUT_MS | 90000 | Combined research deadline |
| LOG_LEVEL | info | silent, error, warn, info, debug |

No external credentials are needed for local project planning, cart CRUD, budget calculations, scenarios, risks, workspace edits and seller draft templates. Without search configuration the research response has `status: "unavailable"`, no offers and a reason. To explore the offline flow set `RESEARCH_MODE=demo`: offers are explicitly fictional, contain no real seller links and must never be represented as current market data. Local AI mode is an honest limited parser; it asks questions for missing fields and uses provisional planning allocations.

## State and orchestration

`ProjectService` is the integration layer. `Planner` and `SearchProvider` are injectable and mocked in tests. Planner output and agent command arguments are validated before use. Workspace definitions use a fixed widget registry and contain only declarative data. The assistant proposes at most five actions; none execute until the user confirms them using `/actions/:actionId/confirm`. Rejections and applied actions are saved. No purchase, booking, payment or message transmission is implemented. Seller messages return `sent: false` and a source URL for a manual handoff.

Budgets use integer euro cents and deterministic arithmetic. Allocations are spending envelopes, not actual purchases. Selected cart lines count as planned commitments; proposed lines are separately tracked. Unknown delivery is excluded from totals with explicit warnings. Category allocations plus reserve cannot exceed the budget; spending may exceed it and then generates warnings. Changing a sourced cart price makes it an estimate. Scenarios recalculate on every relevant mutation, keep selected cart choices, use eligible offers, and label missing-data costs as allocation-based planning estimates. Emergency reserve remains separate from scenario spending.

File persistence validates stored state, uses UUID filenames, restrictive file permissions, temporary-file writes and atomic rename, and serializes updates per project in-process. `expectedRevision` optionally detects stale UI writes. Research work occurs outside the lock and merges only if constraints still match; research history is preserved and marked stale when relevant preferences change. Stale offers are excluded from new selection/simulation. History is bounded to 30 research runs and 200 actions per project. The repository interface can support PostgreSQL/Supabase later; no database is required for this MVP.

## Research and truthful provenance

The live provider uses OpenAI's hosted web search and a second structured extraction request. It requires actual search calls and cited public HTTPS source URLs, limits calls and output sizes, and rejects ungrounded identities and unsafe links. It does not fetch arbitrary URLs or scrape websites. The provider keeps source evidence, unknown fields, source-check timestamps and deterministic score explanations. Current prices reported only in generated search summaries remain estimates; they are not independently verified source prices. Seller identities, images, availability and delivery remain unknown when evidence does not establish them. A price ceiling filters item prices; delivery is separate. Restrictive delivery/new-only preferences can produce limited or empty results.

Official implementation references: [Responses Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses) and [hosted web search](https://developers.openai.com/api/docs/guides/tools-web-search).

`npm run check:live` is a separate, opt-in external integration smoke check. It needs credentials and consumes API credits. Automated tests make no live network requests. API access/model availability and actual live market results must be checked on the demo account before the event.

## Reliability and security

All incoming bodies use strict Zod schemas. Errors have `{error:{code,message,details?}}`. Validation returns 400, unknown resources 404, stale revisions 409, rate limits 429, provider failures 502/503, and model/research timeouts 504. Responses omit provider errors and secrets. Bodies are limited to 32 KiB; AI/research routes have tighter rate limits. Unexpected errors use a generic response. Exact origin checks, Helmet headers, bearer-token support and redacted request logging are enabled. Untrusted search content is separated from system instructions and never executed. Links must be public HTTPS URLs; the server does not fetch user-supplied URLs.

The default is a single-user local demo. The shared deployment token is not a per-user identity system. Internet production requires user authentication, project ownership authorization, durable database storage and distributed concurrency/rate-limit controls. Local file storage supports one backend process; it is not a multi-process database. No insurance coverage or risk probability is claimed. Risk warnings express observed gaps and suggested preventive steps, without treating an unknown seller as fraudulent.
