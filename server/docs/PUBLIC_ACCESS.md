# Secure public beta (contract 1.5.0)

Implemented and deployed to isolated mock-only Railway staging on 2026-10-17; see `RAILWAY_STAGING_RESULTS.txt`. Production variables, credentials and volume contents have not been changed.
Both public flags default to false. Do not enable public access until staging, backups and proxy checks below pass.

## File map

Created:

- `server/src/access-context.ts`, `server/src/security-store.ts`, `server/src/public-access.ts`: request identity, SQLite sessions/accounting, route protection and admin APIs.
- `shared/contracts/access.ts`: validated session and owned-list responses.
- `src/api/access.ts`, `src/features/access/SessionBoundary.tsx`: session bootstrap, identity/cache handling and focused access UI.
- `server/tests/public-access.test.ts`, `tests/public/access.spec.ts`, `playwright.public.config.ts`: backend security/HTTP tests and isolated public browser flows.
- `deploy/Caddyfile.public`, `server/docs/PUBLIC_ACCESS.md`: opt-in proxy and rollout documentation.

Modified:

- `server/src/config.ts`, `app.ts`, `repository.ts`, `ai.ts`, `research.ts`: opt-in flags, authorization, atomic ownership records and provider-level metering.
- `server/package.json`, `server/package-lock.json`: minimum Node version for built-in SQLite; no new package dependencies.
- `shared/contracts/index.ts`: access exports and contract version 1.5.0.
- `src/App.tsx`, `src/api/live.ts`, `src/api/types.ts`, `src/stores/projects.ts`: session boundary, CSRF/idempotency headers, friendly errors and memory-only public project summaries.
- `src/features/pages/Settings.tsx`, `MyProjects.tsx`, `src/features/shell/AppShell.tsx`: token-free public access, private listings and quota status.
- `server/tests/conversation-recovery.test.ts`, `tests/ui/interaction.spec.ts`: adapt existing fixtures to the stored-record envelope and session probe.
- `.env.example`, `deploy/web.Dockerfile`, `server/docs/FRONTEND_HANDOFF.md`: configuration, opt-in Caddy selection and contract handoff.

## Architecture

Browser → same-origin `/api` → opt-in Caddy proxy → Fastify → existing JSON projects and SQLite on `/data`.
One API process only. No PostgreSQL or external session infrastructure is required.
Requires Node >=22.13 for built-in `node:sqlite`; the current Docker base is Node 22.

- Anonymous credentials are 32 random bytes in host-only HttpOnly, Secure, SameSite=Lax cookies.
- SQLite stores only credential SHA-256 hashes, random principal IDs, roles and timestamps. Raw session credentials are never returned in JSON.
- CSRF nonces are derived by HMAC from the HttpOnly credential, returned by the session endpoint, kept only in JavaScript memory and compared server-side.
- Every mutation requires an exact allowed Origin, JSON content type and CSRF nonce. Session bootstrap and admin login require the allowed Origin and JSON but have no prior nonce.
- Anonymous and administrator cookies are separate. Admin logout restores the browser's anonymous session; no visitor credential is promoted to admin.
- Health and an unauthenticated GET session probe never create persistent sessions.
- Every project route has a central ownership guard before handler/provider work. The repository independently enforces ownership under request-scoped AsyncLocalStorage.
- Owned files have `{format:1, ownerId, project}` in one atomic JSON record. Ownership is never accepted from the client or exposed in project contracts.
- Old plain project JSON is interpreted as `legacy-admin`, remains unchanged on read, and is invisible to anonymous visitors. Legacy/private writes retain plain JSON format. No automatic claiming or destructive migration exists.
- Disabling public mode in THIS version makes public-owned records inaccessible to the legacy shared token. It does not expose those records.
- All public/private session responses have Cache-Control: no-store. Auth, cookies, CSRF headers and request bodies are redacted in application logging.

## Lifecycle and limitations

Anonymous sessions expire after 30 days by default. Explicit `POST /api/session/renew` rotates the credential and extends expiry without changing the owning principal. Old credentials immediately stop working.
Admin sessions expire after one hour by default. Renewal can rotate the cookie but does not extend that absolute expiry; sign in again with the private key.
`DELETE /api/session` revokes the effective session and expires its cookie. This can permanently lose anonymous workspace access. The UI warns about cookie loss and offers renewal.
`POST /api/admin/logout` revokes only the admin session. No credentials are saved to localStorage.
Expired sessions are rejected immediately. Cleanup runs at startup and session creation. Projects of expired/revoked sessions are retained, never reassigned; administrators can review them.
There is no email recovery or automatic ownership migration. Future accounts can replace the principal resolver without removing repository authorization.

## New API endpoints

Shared schemas: `shared/contracts/access.ts`, re-exported by `shared/contracts/index.ts`.

| Endpoint | Behavior |
| --- | --- |
| GET /api/session | Public/legacy mode, safe principal summary, CSRF nonce, remaining provider-call quota and UTC reset. No implicit session creation. |
| POST /api/session | `{}`; create an anonymous session or return the current one. |
| POST /api/session/renew | `{}`; CSRF-protected credential rotation. |
| DELETE /api/session | `{}`; CSRF-protected revocation. |
| GET /api/projects | Only the current principal's project summaries. Admin sessions can list all. |
| POST /api/admin/login | `{key}`; independent private key, attempt throttling, short-lived admin cookie. |
| POST /api/admin/logout | `{}`; admin role and CSRF required. |
| GET /api/admin/status | Admin-only usage/cost estimates and public-AI switch state. |
| PATCH /api/admin/public-ai | `{enabled:boolean}`; admin-only persistent runtime switch. Cannot override PUBLIC_AI_ENABLED=false. |
| GET /api/admin/projects | Admin-only project summaries, including legacy records. |

All existing nested project routes retain their response shapes. A missing/expired session returns 401 SESSION_REQUIRED; inaccessible projects return 404.
Paid-capable POST endpoints require a fresh UUID `Idempotency-Key`: creation, assistant, direct research, action confirmation and insurance quotes.
Repeating an ID returns 409 DUPLICATE_REQUEST rather than replaying a provider call. Reload the workspace after uncertain results. Raw request/response payloads are not cached. IDs are retained for seven days.
No admin endpoint enables policy purchases, payments or message transmission.

## Quotas and approximate cost controls

Five **actual provider invocations**, not five chat messages, per anonymous principal per UTC day.
Creation normally uses one. Ambiguous assistant messages can use two. Live research uses a search call and, when evidence is returned, a second extraction call. Each call independently reserves quota/cost before dispatch, including research executed by confirmed actions.
Local planning/demo research make no paid provider calls and do not consume this allowance.
The OpenAI SDK boundaries are metered directly. Injected test providers use the same boundary without network traffic.

SQLite BEGIN IMMEDIATE transactions atomically check quota, global budget and provider concurrency, then persist a reservation before dispatch.
Default concurrency: one paid request per anonymous session and three provider requests globally. Request-level reservations also stop same-session duplicate/in-flight expensive requests.
Workspace creation is bounded to five per session. Repository serialization enforces the limit when saving, with an early route check before planning.
Public users cannot use the old bearer token to bypass these controls in public mode.

Pricing must be supplied explicitly for the configured model; no rates are invented.
Reservation = configured conservative input-token allowance × input rate + max output tokens × output rate + maximum search calls × search-call rate.
The default reserved input allowance is 200,000 tokens; serialized input bytes plus an overhead allowance must fit this bound before dispatch.
Usage from provider responses reconciles input/output tokens and reported web-search calls; unused estimated allowance is released on successful reconciliation.
Unknown usage, transport failures and timeouts retain the full estimate and consume a call, because failure does not prove the provider charged nothing.
Reservations left pending by a crash retain their estimated charge after restart; request/provider concurrency leases are cleared on process restart. Stale request leases recover after ten minutes. Never run multiple API processes against this setup.
Reservations are attributed to their UTC dispatch day. Unsent future calls reserve nothing. Billing records retain no prompts, PINs, provider payloads or credentials.

**This is an approximate application safety budget, not a guaranteed provider billing ceiling.** Provider price changes, tokenizer overhead, search input, late billing, or underestimated bounds can exceed estimates. Verify rates and conservative bounds against the actual model before paid staging. Use provider-side spending controls and alerts as an additional safeguard.
Public and admin usage have separate configurable daily safety budgets. Global concurrency applies to both. The admin budget cannot be bypassed by the UI.

Structured failures include AI_QUOTA_EXCEEDED, GLOBAL_AI_BUDGET_EXCEEDED, PUBLIC_AI_DISABLED, AI_BUSY, WORKSPACE_LIMIT and IDEMPOTENCY_REQUIRED. Saved reads and manual changes remain usable after AI exhaustion.

## Abuse controls

Existing Fastify limits remain. Added durable per-session 120/minute throttling; per-IP new-session limit of 10/hour; global new-session limit of 100/hour; admin login limit of five attempts/IP/hour.
Counters use server time. IP keys are hashed before persistence.
trustProxy remains false: do not blindly trust incoming X-Forwarded-For. Behind Railway/Caddy, IP-based buckets can be shared across visitors; this conservatively limits throughput. Verify the real proxy chain in staging before tuning or trusting forwarding headers.
Fresh cookies cannot reset the global monetary/concurrency/session-creation limits, but anonymous access cannot establish unique people. Sustained abuse can exhaust the public allowance or cause denial of service. Add an abuse challenge if actual traffic requires it.
The public project listing scans existing files; this is a small single-process beta, not a scalable multi-instance database. No central identity can protect against XSS running on the application's own origin; keep dependencies and rendering protections current.

## Frontend handoff

Normal visitors see no token form in public mode. Session initialization is single-flight; it occurs on app/create routes, not landing-page crawls. Failed initialization has an explicit reconnect action and offline demo option, without an automatic retry loop.
Authentication uses browser cookies only. The CSRF nonce and safe session info live in memory. No session/admin credential enters localStorage or AI prompts. Any old shared token is cleared from browser settings in public mode.
The initial owned listing replaces old live-project browser metadata. Public live-project summaries stay in memory, not localStorage; reload restores them from the owner-filtered API. Identity changes clear query caches, assistant drafts and live summaries before loading the new principal's projects. BroadcastChannel propagates admin sign-in/out between tabs; focus refreshes verify identity, and late API responses from a previous identity are discarded.
Quota status is shown in the existing shell. Settings supports renewal and a collapsed admin sign-in form; the key input is cleared on submit. Admin APIs also support legacy-project review and quota inspection without a large dashboard.
Public mode rejects cross-origin browser API configuration with an actionable error; use `/api` on the web origin. Legacy token mode continues to support its existing VITE_API_BASE deployment.

## Production Railway preparation — not activated

Verified existing services: `api`, `web`; API volume `/data`, one replica. Keep that topology.

### API service variables

| Variable | Default / required value |
| --- | --- |
| PUBLIC_ACCESS_ENABLED | false; enable only after approved staging |
| PUBLIC_AI_ENABLED | false; enable only after verified rates/bounds |
| DATA_DIR | /data |
| SECURITY_DB_PATH | /data/security.sqlite |
| STORAGE_MODE | local |
| HOST | 0.0.0.0 |
| API_TOKEN | Keep existing server-only value; never reuse as admin key |
| ADMIN_ACCESS_KEY | NEW cryptographically random 32+ character credential; generate outside committed files |
| SESSION_COOKIE_SECURE | true; false allowed only for loopback HTTP development |
| ALLOWED_ORIGINS | Exact HTTPS web origin(s), no wildcards |
| SESSION_TTL_SECONDS | 2592000 |
| ADMIN_SESSION_TTL_SECONDS | 3600 |
| PUBLIC_AI_REQUESTS_PER_DAY | 5 |
| PUBLIC_MAX_CONCURRENT_AI_REQUESTS_PER_SESSION | 1 |
| GLOBAL_MAX_CONCURRENT_AI_REQUESTS | 3 |
| PUBLIC_MAX_WORKSPACES_PER_SESSION | 5 |
| GLOBAL_DAILY_AI_BUDGET_USD | 3.00, estimated |
| ADMIN_DAILY_AI_BUDGET_USD | 3.00, separate estimated allowance |
| AI_INPUT_USD_PER_MILLION | Required verified model input rate for paid access |
| AI_OUTPUT_USD_PER_MILLION | Required verified model output rate |
| AI_WEB_SEARCH_USD_PER_CALL | Required verified search rate |
| AI_RESERVED_INPUT_TOKENS | 200000; verify conservative bound |
| NEW_SESSIONS_PER_HOUR | 10/IP/hour |
| GLOBAL_NEW_SESSIONS_PER_HOUR | 100/hour |

Keep existing OPENAI_* and IF_* secrets API-only. Do not print them in logs or place them in VITE_* variables.

### Web service variables and proxy

The original Caddyfile remains the default. Public routing is opt-in using `deploy/Caddyfile.public`.

- Build-time `VITE_API_BASE=/api` (requires rebuilding the frontend).
- Runtime `CADDY_CONFIG=Caddyfile.public`.
- Runtime `API_UPSTREAM=http://${{api.RAILWAY_PRIVATE_DOMAIN}}:${{api.PORT}}` using Railway reference variables for the **actual API service**, not an invented hostname. If service names differ, select the real service in Railway.
- PORT remains Railway supplied.
- No API_TOKEN, admin key or provider secret on the web service.

Official sources: [Railway private domains/reference variables](https://docs.railway.com/networking/domains/working-with-domains), [Caddy SPA/API proxy guidance](https://docs.railway.com/guides/spa-routing-configuration), [Node SQLite](https://nodejs.org/download/release/latest-jod/docs/api/sqlite.html).

Keep the API volume mounted at `/data`, writable only by the API process. SQLite database, WAL and SHM files must all stay on the volume. Do not place the database in the container's ephemeral filesystem or bake it into Docker.
Configure API health check `/api/health`. Health does not create sessions or expose credentials.
If the direct public API URL is retained, the same server-side session/ownership/CSRF checks apply. Prefer removing its public networking after private proxy verification if no external client needs it. CORS is not the authorization boundary.

## Staging, backup and rollback checklist

1. Request approval before any Railway deploy or variable change. This implementation performs neither.
2. Create isolated staging services/storage and synthetic projects. Never attach the production volume or copy private records into public demo fixtures.
3. Deploy with public access enabled, paid AI disabled, and local/demo providers; verify the real private hostname/port, Caddy proxy and HTTPS cookies in two independent browsers.
4. Verify Secure/HttpOnly/host-only/SameSite cookies; no cookie credential in JavaScript, localStorage, network response JSON, AI input or logs. Test admin login/logout, invalid CSRF, session renewal and expired sessions.
5. Verify every cross-user nested endpoint returns 404 before provider work; old UUIDs are denied; independent browsers see only their own metadata; restart preserves access and quotas.
6. Verify mocked cost exhaustion, research confirmation paths, concurrency, duplicate submissions, public-AI pause and independent admin limits. Paid smoke tests require separate explicit authorization and verified rates.
7. Before production activation, take a Railway volume backup of all `/data` (projects plus SQLite/WAL), and test restoration into protected storage. For manual copies, stop writes and checkpoint/close SQLite first; copying only security.sqlite while WAL is active can lose sessions/accounting.
8. Activate only after backup restore and staging gates pass. Keep one process, both existing secrets and the independent admin secret protected. Review counters/errors without personal payloads.
9. Rollback: first pause public paid AI through the admin switch or PUBLIC_AI_ENABLED=false. To close access, use PUBLIC_ACCESS_ENABLED=false **with this ownership-aware build**; public-owned files remain denied to legacy-token callers. Do not delete SQLite or remove ownership metadata. Restoring an older pre-ownership image against public-owned data is unsafe/incompatible: isolate that data and restore the paired pre-release snapshot instead.
10. Restore project files AND security database/WAL from a consistent snapshot; restoring only one can lose ownership/session continuity or quota reservations. Never let visitors claim ownerless records after a restore.

The actual Railway staging deployment, private-network/HTTPS validation and backup restoration are approval-gated and have NOT been performed here. Public launch is not recommended until those gates pass.

## Local checks (mocked; no OpenAI charges)

```sh
npm test --prefix server
npm run typecheck --prefix server
npm run typecheck
npm run build --prefix server
npm run build
npx playwright test --config playwright.public.config.ts
npx playwright test
```

Public browser fixtures use local planning, demo research, temporary storage and separate ports 3016/5186. Production data and running app ports are not used. There is no lint script configured in this repository.
