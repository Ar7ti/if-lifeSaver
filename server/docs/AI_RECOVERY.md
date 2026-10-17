# Urgent AI recovery — 2026-10-17

## Root causes and fixes

1. **Repeated scope clarification:** the scope gate returned a generic question without persisting it, and the next message was classified without that question. Project-scoped conversation state now records recent turns, the active task and clarification lifecycle. Short answers resume the pending task. Known-field questions are removed, and a third equivalent unresolved clarification switches to specific guidance rather than repeating the question.
2. **Ignored casual requests:** literal keywords missed sleep/accommodation paraphrases, slang and `aviatickets`. Contextual normalization plus strict model-based interpretation for remaining ambiguity handles these. The action mapper previously forced multiple research proposals into one category; accommodation and flights now retain separate categories. Out-of-scope technical tutorials are still gated before model calls.
3. **Lost initial facts:** `going to`, `traveling` and `travelling` were missing from intent/location recognition, and creation trusted the blueprint instead of reconciling explicit initial facts into canonical state. Travel intent, route, duration, dates, party and EUR budget now survive creation and persistence. Existing missing initial facts can be repaired from the original request without replacing selected cart lines. Foreign-currency amounts and individual item prices are not silently treated as EUR project totals.
4. **Answers did not update state:** the assistant previously only generated action proposals. Chat answers now pass through extraction, validation, canonical fact persistence, question reconciliation, workspace refresh and deterministic recalculation. PATCH answers share that path. Confirmed allocations remain intact; increased budgets leave unassigned funds. Reducing a budget below current allocations requires reviewing them first.
5. **No server conversation memory:** browser thread state did not reach the model. The backend now persists up to 12 turns and 40 clarification records per project, sends only six recent turns plus compact project state, and prioritizes the last actual assistant question. IDs, field, status, timestamps, answer, original intent and attempts make clarifications auditable. Unrelated new project requests do not rewrite the active project's facts.

Explicit facts are saved before model generation. A provider error returns a recoverable error while retaining those facts. Storage writes remain atomic; a failed write preserves previously confirmed state and can be retried. AssistantPanel refreshes canonical state after errors as well as successes. No frontend styling, layout, provider, model or environment settings changed.

## Changed files

- `server/src/conversation.ts`: bounded conversation/clarification state, answer matching, normalization and grounded structured interpretation schema.
- `server/src/service.ts`: canonical update flow, reconciliation, loop protection, initial fact repair, action deduplication and failure boundaries.
- `server/src/ai.ts`: compact conversation context, optional structured interpretation and separate travel research actions.
- `server/src/scope-policy.ts`, `scenario-profile.ts`: contextual scope and initial fact parsing fixes.
- `shared/contracts/index.ts`: additive optional conversation schema, contract 1.2.0.
- `src/features/assistant/AssistantPanel.tsx`: refresh saved project facts after an assistant error; no visual changes.
- Tests: `conversation-recovery.test.ts`, `conversation.test.ts`, extended `scenario-profile.test.ts`.
- `server/scripts/check-conversation-live.ts`, package script and backend handoff documentation.

## Verification

- **181 backend tests passed; zero failed.** This includes eight real TCP conversation workflows using `app.listen()` and `fetch`, local-file restart/persistence, exact casual requests and short confirmations, budget/date/traveler/inventory answers, cross-project isolation, known-question filtering, loop limits, actual injected model/storage failures and retry. Existing finance, cart, research, API and timeout tests remain passing.
- **10 browser regression tests passed; zero failed.** Existing moving/travel/car workflows, forms, cart and assistant behavior remain working.
- Backend build/typecheck and frontend production build passed; `git diff --check` passed.
- **Configured live `gpt-6.1-sol` HTTP check passed:** created a five-day Rome trip with EUR900 and known dates/two travelers; the exact casual sleep/aviatickets request returned separate accommodation/flight proposals without asking for known budget/dates; `Yes, it is.` continued the saved trip; a separate bare `€900.` answer saved the budget and removed its question. GET reload retained conversation and canonical facts. No research or external commitment was executed. The local report is `server/data/recovery-live/conversation-live-report.json`.

```sh
npm --prefix server test
npm --prefix server run build
npm run build
npm run test:ui
```

With the live backend running and existing credentials configured:

```sh
cd server
npm run check:conversation-live
```

The live check consumes model credits and leaves test projects. It does not purchase, book, contact a seller or execute proposed research.

## Limits

Local parsing is bounded; ambiguous wording may need a specific clarification. The configured model can interpret unfamiliar wording, but only evidence-backed facts can enter canonical state. A failed storage write cannot save new information until retry; previously confirmed information is retained. The frontend-only mock adapter remains a fixed demo; use the API data source for this recovery flow. External search availability/prices retain their existing uncertainty and verification limits.
