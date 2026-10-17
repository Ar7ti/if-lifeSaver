# Backend contract handoff — v1

Source of truth: `shared/contracts/index.ts`. Backend runs separately on `http://127.0.0.1:3001`; configure the frontend dev proxy to forward `/api` there, or use an explicit API base URL. The backend owns no `src/` or `public/` files and uses its own `server/package.json`.

Install: `npm --prefix shared/contracts install && npm --prefix server install`.
Run: `cd server && npm run dev`. Server environment belongs in `server/.env` (copy `server/.env.example`). Local planning, budgets, carts, scenarios, risks and file persistence run without credentials. Research is unavailable unless enabled with OpenAI credentials or `RESEARCH_MODE=demo`.

## Money and state

All `*Minor` fields are integer euro cents; supported currency is EUR for this MVP. Research request `maxPrice` is in euros (`250` means €250), preserving the requested wire example. Display `minor / 100` with Intl.NumberFormat. Unknown offer prices/delivery costs are `null`, never zero. `budget.committedMinor` means selected planning commitments, never a payment. `remainingMinor = totalMinor - committedMinor`; `availableMinor` also subtracts proposed items and emergency reserve. Explicitly show demo/estimated/unverified fields.

Projects embed their workspace, cart, researchResults, scenarios, risks, tasks, actions and revision. Project writes optionally accept `expectedRevision` to detect stale UI edits; conflict returns 409. Refresh full project after mutations. Cart responses include recalculated budget and revision; other derived data is on GET project.

## Routes

| Route | Request | Response |
|---|---|---|
| POST /api/projects | CreateProjectRequest | `{project,workspace,questions}` (201) |
| GET /api/projects/:id | — | `{project}` |
| PATCH /api/projects/:id | ProjectPatch | `{project}` |
| POST /api/projects/:id/assistant | AssistantRequest | `{reply,proposedActions,workspacePatch}` |
| POST /api/projects/:id/research | ResearchRequest | ResearchResult, including status/mode/offers/warnings |
| GET /api/projects/:id/cart | — | `{items,budget,revision}` |
| POST /api/projects/:id/cart/items | AddCartItemRequest | `{items,budget,revision}` (201) |
| PATCH /api/projects/:id/cart/items/:itemId | CartItemPatch | `{items,budget,revision}` |
| DELETE /api/projects/:id/cart/items/:itemId | — | `{items,budget,revision}` |
| GET, POST /api/projects/:id/scenarios | no body | `{scenarios}` |
| GET /api/projects/:id/risks | — | `{risks}` |
| GET /api/projects/:id/workspace | — | `{workspace,revision}` |
| PATCH /api/projects/:id/workspace | WorkspacePatch | `{workspace,revision}` |
| POST /api/projects/:id/seller-message | SellerMessageRequest | `{draft,handoffUrl,sent:false,warnings}` |
| POST /api/projects/:id/actions/:actionId/confirm | `{approved:boolean,expectedRevision?:number}` | `{project}` |
| GET /api/health | — | HealthResponse |

Cart insert: use `{offerId, quantity:1, status:'selected'}` for researched offers, or a manual estimate with `{title,category,unitPriceMinor,quantity:1}`. Selecting an item only adds it to the plan. Editing sourced prices marks them estimated.

Workspace patches use existing widget IDs, e.g. `{widgets:[{id,visible:false}]}` or `{widgets:[{id,position:{x:0,y:0,w:6,h:4}}]}`. Config permits only category, sortBy, compact. Supported types: budget, product_catalog, shopping_cart, service_finder, scenario_comparison, risk_guardian, timeline, recommendations, task_list. Never execute workspace strings as code or HTML.

Assistant actions are audited proposals. Confirm an action through the confirm endpoint to apply it; rejected proposals remain in history. Confirming budget/cart/workspace proposals checks current project constraints. No route purchases, sends a message, pays or books. Seller messages are drafts with a source link handoff.

Errors: `{error:{code,message,details?}}`, e.g. VALIDATION_ERROR (400), NOT_FOUND (404), CONFLICT (409), RATE_LIMITED (429), AI_UNAVAILABLE / RESEARCH_UNAVAILABLE (503), UPSTREAM_TIMEOUT (504). Unknown fields are rejected. The API limits body sizes, request rates and AI action counts. Show research loading and errors; allow at least 100 seconds for a live research request.

Local use is a single-user demo. Production needs identity and per-user project authorization; optional API_TOKEN is a shared deployment access token, sent as `Authorization: Bearer ...` and never an OpenAI secret.

TypeScript input helpers `CreateProjectInput`, `ResearchInput`, `AddCartItemInput`, and `SellerMessageInput` allow omitted fields that have server defaults. The `*Request` types describe normalized values after schema parsing. Moving projects always include all nine supported widgets; AI suggestions determine their initial order. Local simulation uses provisional allocation estimates until real offers exist. Fictional demo offers are excluded from automatic scenario selection; demo cart choices are included as explicitly estimated planning costs.
