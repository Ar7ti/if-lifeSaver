# if-liveSaver — Demo Video Brief

**Audience:** Creative director, editor, narrator, and hackathon judges  
**Format:** Premium, two-minute product demonstration  
**Repository inspected:** `regal-hadrosaurus-59639ce3`, working copy based on `e23d129`  
**Inspection date:** 17 October 2026  
**Scope:** Current source code, existing verification records, and credential-free in-memory rehearsals of the supplied scenarios. This briefing adds no application changes, writes no persistent application data, and makes no live provider requests.

> **The central story:** Describe a real-life decision. Get a practical workspace. Compare options, see the financial consequences, and review relevant protection before committing.
>
> **Recording truth:** The current Railway test version runs mock AI and fictional research. Its car-insurance demo also uses explicitly fictional prices. Keep those disclosures visible. The repository contains real OpenAI and If integration code; that does not mean the recording is showing live model output or an official If quote.

## 1. Product identity

### What it is

**if-liveSaver is the repository/project name. The visible application is branded “Life Simulator.”** It acts as an AI Life Copilot: a place to turn a move, purchase, trip, or other practical goal into an organized, editable plan.

Its current insurance feature is named **If Smart Protection**. The application was built for the If Insurance challenge at JunctionX Turku. Do not describe it as an officially approved If partner or an official If customer account.

For titles, use **“Life Simulator — an AI Life Copilot”**, with “if-liveSaver” as a project credit if needed. The existing hero line is **“Your life. Beautifully planned.”**

### The problem

Important decisions spread across search tabs, messages, price lists, checklists, and a mental budget. People need to understand both the next step and what it will cost. An unknown delivery fee, missing inspection, or unreviewed insurance detail can remain hidden until late in the process.

Life Simulator brings those decisions into one workspace, with costs, tasks, uncertainties, and relevant insurance planning alongside the options.

### Target audience

- People moving home or setting up their first independent household.
- People comparing a car purchase and its ongoing expenses.
- Travelers planning transport, accommodation, and a budget.
- People furnishing a home.
- Students organizing study and living logistics; this is a basic supported planning profile, not a complete student services platform.

**Sources:** [visible branding](src/features/shell/Logo.tsx), [landing page](src/features/landing/Landing.tsx), [hero](src/features/landing/Hero.tsx), [scenario profiles](server/src/scenario-profile.ts).

## 2. Core value proposition

### The simple promise

**“A practical plan you can use, with costs and next steps you can understand.”**

The user receives more than a chat answer:

1. **An organized workspace:** Relevant tools appear for the goal.
2. **A usable budget:** Category allocations, selected options, proposals, and a reserve are separated.
3. **A decision surface:** Options can be compared and added to a planning list.
4. **Visible uncertainty:** Unknown charges, unconfirmed availability, and missing information remain visible.
5. **A relevant protection checkpoint:** Moving, car, and travel projects can surface the corresponding If planning workflow.
6. **Control:** Research proposals need approval; quotes need an explicit request; purchases and bookings do not happen in this prototype.

### Why a user should care

The useful result is an actionable plan: **what I intend to do, what the known costs are, what remains uncertain, and what I should check next.**

For If, the product demonstrates a possible role in supporting decisions before a problem occurs. Relevant insurance can enter the planning conversation at the right moment. That is a business hypothesis demonstrated by the workflow, not a measured reduction in claims or a proven conversion improvement.

**Sources:** [project service](server/src/service.ts), [budget and risk calculations](server/src/finance.ts), [workspace tools](src/features/workspace/registry.tsx), [protection rules](server/src/protection.ts).

## 3. Complete feature inventory

### How to read the status

- **Working:** The feature is genuinely implemented. This does not guarantee every external dependency is currently connected.
- **Partial / conditional:** The workflow or adapter exists, but access, data quality, or feature depth limits the result.
- **Experimental / limited demo:** Implemented, but too narrow to imply a finished general capability.
- **Not implemented / future:** Do not demonstrate it as working or imply a committed delivery date.

### A. Opening, creating, and organizing a project

| Feature | Status | What the user sees and can do | Relevant implementation |
| --- | --- | --- | --- |
| Animated landing page | Working UI; illustrative content | Floating illustrations, a typing-style prompt, a scrolling product reveal, story panels, feature cards, and a Risk Guardian section. The miniature workspace and example numbers are composed previews, not a user's actual results. | [Hero](src/features/landing/Hero.tsx), [ProductReveal](src/features/landing/ProductReveal.tsx), [WorkspacePreview](src/features/landing/WorkspacePreview.tsx), [StoryScroll](src/features/landing/StoryScroll.tsx), [ScenarioMarquee](src/features/landing/ScenarioMarquee.tsx) |
| Home dashboard and quick starts | Working | A greeting, the main planning prompt, example requests, service status, and remembered projects. Example cards help fill the prompt; they are not proof that every phrase in their promotional descriptions is implemented. | [Dashboard](src/features/pages/Dashboard.tsx), [examples](src/features/create/examples.ts), [ServiceStatus](src/features/pages/ServiceStatus.tsx) |
| Natural-language project creation | Working; real model use conditional | Enter a goal, destination, dates, budget, and preferences. The backend creates a saved project and workspace. A credential-free local planner also exists. | [Composer](src/features/create/Composer.tsx), [CreateWorkspace](src/features/create/CreateWorkspace.tsx), [planner](server/src/ai.ts), [creation service](server/src/service.ts) |
| Workspace-building transition | Working UI | “Understanding your goal,” tasks, budget, and workspace steps reveal details from the returned result. These are presentation stages, not four separately observed background agents. | [CreateWorkspace](src/features/create/CreateWorkspace.tsx) |
| Scenario-aware workspaces | Working for defined profiles | Moving, travel, car purchase, home furnishing, and student life have different categories, questions, and tools. Owned items are recorded and help avoid unnecessary purchase suggestions. | [profiles](server/src/scenario-profile.ts), [workspace specification](server/src/workspace.ts), [conversation facts](server/src/conversation.ts) |
| General everyday goals | Experimental / basic | Other goals can receive a minimal general plan. This is not equally deep support for every possible life event. | [profiles](server/src/scenario-profile.ts), [scope policy](server/src/scope-policy.ts) |
| Project overview and Edit details | Working | Destination, relevant dates, people/travelers, travel duration, vehicle type/use, and applicable preferences can be edited. Overview cards link to the budget, checklist, and items needing attention. The dialog has a scrollable responsive layout. | [ProjectOverview](src/features/workspace/ProjectOverview.tsx), [Dialog](src/components/ui/Dialog.tsx) |
| Follow-up questions | Working within supported fields | Answer structured questions or write an answer in ordinary language. Saved answers update the plan and stop known facts being asked again. Answers can be reviewed. “Skip for now” in the question interface is a local presentation choice, not an official completion of the task. | [QuestionsBlock](src/features/workspace/QuestionsBlock.tsx), [conversation state](server/src/conversation.ts), [service](server/src/service.ts) |
| Customizable workspace | Working | Hide/show tools, move them up/down, resize eligible tools, collapse panels, and restore a recommended layout. Order, size, and visibility save to the project. This is not a free-form drag-and-drop canvas. | [WorkspaceGrid](src/features/workspace/WorkspaceGrid.tsx), [layout](src/features/workspace/layout.ts), [widget controls](src/features/workspace/WidgetFrame.tsx) |
| My projects | Working | Return to saved projects and see summary cards. Removing a card from the list is not deletion of the server project; public owner listings can restore it after reload. | [MyProjects](src/features/pages/MyProjects.tsx), [ProjectCard](src/features/pages/ProjectCard.tsx), [project store](src/stores/projects.ts) |

### B. Planning, comparing, and taking the next step

| Feature | Status | What the user sees and can do | Relevant implementation |
| --- | --- | --- | --- |
| Budget dashboard | Working | A category chart, total, “Spent in plan,” remaining amount, reserve, proposed expenses, and warnings. Allocated money is not counted as money already spent. “Spent in plan” means selected planning entries, not bank transactions. | [BudgetWidget](src/features/widgets/BudgetWidget.tsx), [BudgetDonut](src/features/widgets/budget/BudgetDonut.tsx), [finance engine](server/src/finance.ts) |
| Budget editor | Working | Change the total, reserve, and category allocations; add or adjust categories. Invalid allocations are rejected. Money is currently planned in EUR. | [BudgetEditor in BudgetWidget](src/features/widgets/BudgetWidget.tsx), [financial validation](server/src/finance.ts), [contracts](shared/contracts/index.ts) |
| Product and service search | Partial / externally dependent | Search a specific item or service, with a maximum price and preferences. Relevant starters change with the scenario. Live research is implemented; the test deployment returns fictional examples instead. Empty or limited results are valid outcomes. | [ResearchCatalog](src/features/widgets/research/ResearchCatalog.tsx), [research planning](server/src/research-intent.ts), [provider](server/src/research.ts) |
| Search-result cards | Working UI; data conditional | Price or unknown-price state, source link where available, reported location, delivery, condition, availability, explanation, evidence, and time checked. Missing data stays missing. The current live extraction does not independently verify a seller or return listing photographs. | [OfferCard](src/features/widgets/research/OfferCard.tsx), [OfferImage](src/features/widgets/research/OfferImage.tsx), [offer extraction](server/src/research.ts) |
| Filtering and price classes | Working | Sort by recommendation or price; filter by text, condition, seller type, and budget fit. Economy/Mid-range/Premium splits priced results into relative price groups; it is not an independent quality assessment. Seller filters can be unhelpful when live seller type is unknown. | [ResearchCatalog](src/features/widgets/research/ResearchCatalog.tsx), [tiers](src/features/widgets/research/tiers.ts) |
| Side-by-side offer comparison | Working | Select two to four options and compare price, delivery, condition, seller, location, match score, and provenance. Unknown values remain unknown. | [CompareDialog](src/features/widgets/research/CompareDialog.tsx), [selection controls](src/features/widgets/research/ResearchCatalog.tsx) |
| Planning cart | Working | Add researched options, change quantity, move entries between proposed and selected, remove entries, and undo removal. Budget changes follow. It is a planning list, not a checkout. | [ShoppingCart](src/features/widgets/ShoppingCart.tsx), [cart service](server/src/service.ts), [finance](server/src/finance.ts) |
| Add your own estimate | Working | Enter a title, category, quantity, price, optional additional charge, and optional link. It is visibly estimated. Useful when research has no usable price. | [ManualItemDialog](src/features/widgets/research/ManualItemDialog.tsx) |
| Economy / Balanced / Comfort | Working comparison; estimates depend on evidence | Compare totals, reserve impact, effort, convenience, trade-offs, risks, and missing data. Existing selected items are respected. With suitable live results, offers can be proposed for the plan. Without them, category-based estimates may produce identical outcomes. Fictional backend research offers are not automatically treated as real scenario candidates. | [ScenarioSimulator](src/features/widgets/ScenarioSimulator.tsx), [simulateScenarios](server/src/finance.ts) |
| Life Risk Guardian | Working rules-based feature | Flags known gaps such as unknown charges, unconfirmed availability, seller information needing review, budget pressure, missing dates, and service terms. Each alert has a preventive step and expandable reasoning. “Get help” prepares an assistant request. This is not an actuarial risk prediction or insurance-coverage decision. | [RiskGuardian](src/features/widgets/RiskGuardian.tsx), [analyzeRisks](server/src/finance.ts) |
| Checklist | Working | Check tasks off, show completed tasks, expand notes, see due dates and overdue indicators, and star priorities. Task completion saves to the project. Stars are browser-local. | [TaskList](src/features/widgets/TaskList.tsx), [task updates](src/features/widgets/useTaskStatus.ts), [local UI state](src/stores/ui.ts) |
| Timeline / trip itinerary | Working basic view | Dated tasks line up with a move date or departure date. Undated tasks are listed honestly as unscheduled. This is not a booking calendar or a guaranteed day-by-day travel itinerary. | [ActionTimeline](src/features/widgets/ActionTimeline.tsx), [workspace naming](server/src/workspace.ts) |
| Suggested next steps | Working | Short recommendations and an expandable assumptions section. “Start” prepares the request in the assistant; the user still sends it. | [RecommendationsWidget](src/features/widgets/RecommendationsWidget.tsx), [workspace ask handler](src/features/workspace/WorkspacePage.tsx) |
| Seller / provider inquiry draft | Working; template-based | Create an editable English or Finnish inquiry, copy it, and open the listing when a real link exists. The server composes it from recorded details; this feature does not require a model to write a new message. Nothing is transmitted to the seller. | [SellerMessageDialog](src/features/widgets/research/SellerMessageDialog.tsx), [drafting in service](server/src/service.ts) |
| In-workspace assistant | Working; model conditional | A desktop side panel or mobile sheet answers in project context and proposes bounded actions. Apply or dismiss those proposals. It supports practical planning, not general unrelated tutorials. Replies appear after completion; the interface is not token-by-token model streaming. | [AssistantPanel](src/features/assistant/AssistantPanel.tsx), [ActionCard](src/features/assistant/ActionCard.tsx), [AI orchestration](server/src/ai.ts), [scope](server/src/scope-policy.ts) |

### C. If Smart Protection

| Feature | Status | What genuinely works | Relevant implementation |
| --- | --- | --- | --- |
| Contextual protection recommendation | Working | Moving → home; car purchase → car; travel → travel review. The card explains relevance. It says insurance has not been checked, not that the user is uninsured. | [ProtectionSection](src/features/workspace/ProtectionSection.tsx), [product registry and state](server/src/protection.ts) |
| Review / postpone / existing cover | Working | Postpone, reopen, mark reviewed, or self-report existing insurance. These states are not proof of purchase or active coverage. Material changes can prompt another review. | [ProtectionSection](src/features/workspace/ProtectionSection.tsx), [protection rules](server/src/protection.ts) |
| Home quote form and saved details | Working | For moving projects only: reuse the city and move date, then supply address, postal codes, living area, dwelling type, and start date. Requesting a quote is an explicit action. | [HomeInsuranceSection](src/features/workspace/HomeInsuranceSection.tsx), [home contracts](shared/contracts/home-insurance.ts) |
| Real Finnish home quote and coverage lookup | Partial / requires authorized If access | Backend adapters exist for requesting a quote and reading coverage descriptions. Returned amounts, periods, validity, terms, and coverage can be displayed. In the current staging environment, live quoting is unavailable. There is no equivalent built-in fictional home-price success flow. | [home provider](server/src/if-insurance.ts), [archived quote specification](server/docs/if/quote-fi.openapi.json), [coverage specification](server/docs/if/coverage-fi.openapi.json) |
| Car insurance form | Working | Reuse saved vehicle context; confirm a fictional registration, age-group answer, mileage, and optional price/address. Choose Demo or the If connection when available. The car's purchase price alone is not enough for a real insurance price. | [CarInsurancePanel in ProtectionSection](src/features/workspace/ProtectionSection.tsx), [contracts](shared/contracts/protection.ts) |
| Fictional car price demonstration | Working demo | Basic and Extended examples, monthly/yearly prices, coverage text, a deliberate error example, and retry. Fixed fictional examples are not If underwriting or actual cover. | [demoCarPrices](server/src/car-insurance.ts), [source labels](src/features/protection/ui.tsx) |
| Real Finnish car price adapter | Partial / requires authorized If access | Provider code and the archived Finnish API specification exist. Returned options are normalized and shown. The current staging has no If credentials. Selecting a real price cannot silently fall back to a fictional one. No quote expiry or provider reference is invented when the API does not supply one. | [If car provider](server/src/if-car-insurance.ts), [gateway](server/src/car-insurance.ts), [archived specification](server/docs/if/car-fi.openapi.json) |
| Insurance as a recurring proposed expense | Working for demo car; live home/car conditional | Select a billing option and planning period; add the cost only after an explicit click. Preserve the original premium and period, calculate full installments, and show its budget effect. A yearly bill counts in full. Duplicate proposals are prevented. Sandbox test prices cannot be added as real expenses. | [BudgetLinked](src/features/protection/BudgetLinked.tsx), [link calculations](server/src/protection.ts), [home calculation](server/src/if-insurance.ts), [finance](server/src/finance.ts) |
| Price invalidation | Working | Changed vehicle, home, or saved rating details can make an old result require review. An existing linked proposal is retained for review, not silently replaced. | [fingerprints and reconciliation](server/src/protection.ts), [quote orchestration](server/src/service.ts) |
| Insurance through conversation | Working bounded actions | Ask to review insurance, open its form, see a saved result, explain its budget effect, or open My Protection. The same saved state is used. Chat cannot autonomously send identity data or obtain an official premium from model knowledge. | [insurance summary](server/src/protection.ts), [assistant and commands](server/src/service.ts), [ActionCard](src/features/assistant/ActionCard.tsx) |
| My Protection | Working | An overview across the current user's known workspaces: recommended items, prices received, items needing attention, and reviewed/postponed items, with links back to the workspace. It shares the project records. It is not an If policy account. Its combined budget figure can include different planning horizons; do not call it a single annual premium. | [MyProtection](src/features/pages/MyProtection.tsx), [shared project queries](src/hooks/useProject.ts) |
| Travel insurance pricing | Not implemented | A contextual review card and official information link exist. This codebase does not provide a travel quote flow. | [travel card](src/features/workspace/ProtectionSection.tsx), [capabilities](server/src/car-insurance.ts) |

### D. Access, reliability, and presentation

| Feature | Status | User-facing meaning | Relevant implementation |
| --- | --- | --- | --- |
| Private anonymous public access | Working in isolated staging; production rollout incomplete | No shared token entry in public mode. Browser sessions own their projects, including insurance data. Sessions and quotas persist on the volume. Production still requires its separately controlled rollout. Clearing cookies can permanently lose anonymous access. | [session handling](src/api/access.ts), [server access](server/src/public-access.ts), [ownership](server/src/repository.ts), [staging report](server/docs/RAILWAY_STAGING_RESULTS.txt) |
| AI allowance and error states | Working | Remaining calls, daily UTC reset, friendly quota/capacity/network errors, and continued manual access when AI is unavailable. This is not a guaranteed insurer or AI-provider spending ceiling. | [SessionBoundary](src/features/access/SessionBoundary.tsx), [error messages](src/api/types.ts), [durable limits](server/src/security-store.ts) |
| Settings and offline mode | Working settings; limited offline adapter | Choose server-backed service or the browser-only fictional demo. The older browser-only adapter always creates a moving fixture and lacks Smart Protection car pricing; it must not be used for the multi-scenario insurance film. | [Settings](src/features/pages/Settings.tsx), [API selection](src/api/index.ts), [offline fixture](src/api/mock.ts), [demo banner](src/features/shell/DataSourceBanner.tsx) |
| Responsive layouts and animation | Working | Mobile navigation, desktop/mobile assistant layouts, native dialogs, animated charts, progress rings, widget transitions, and reduced-motion behavior. Main interface text is English; Finnish seller drafts are not full Finnish localization. | [AppShell](src/features/shell/AppShell.tsx), [WorkspacePage](src/features/workspace/WorkspacePage.tsx), [motion helpers](src/features/landing/motion-kit.tsx), [design tokens](src/index.css) |
| Administrative mode | Working support feature; exclude from film | Separate private administrator sign-in, public-AI switch, and authorized legacy-project review. It is not a customer feature or a screen to record. | [access UI](src/features/access/SessionBoundary.tsx), [admin routes](server/src/public-access.ts) |

### Explicitly outside the implemented product

The inspected app does **not** implement insurance purchase/activation, payment, automatic booking, sending seller messages, a verified policy account, bank connection, transaction importing, credit/loan approval, cross-user collaboration, email/social accounts, anonymous account recovery, a floor-plan editor, or a full booking itinerary engine. Background research jobs and multi-replica scaling are not implemented. These are possible future directions, not promised roadmap items.

**Evidence for these boundaries:** [current routes](server/src/app.ts), [client API surface](src/api/types.ts), [contracts](shared/contracts/index.ts), [repository](server/src/repository.ts), [protection capabilities](server/src/car-insurance.ts).

## 4. User journey: from first opening to a valuable result

1. **Open the landing page or the app.** The landing explains the concept; the dashboard invites a goal. In public staging, a private session is established without a shared token.
2. **Describe the situation.** For example: a move, €2,000, an owned bed and desk, and a missing sofa.
3. **Receive a relevant workspace.** The project contains a budget, appropriate tools, starting tasks, and remaining questions. Creation does not automatically complete web research or request an insurance quote.
4. **Answer only what is missing.** Confirm a date or preference. Edit details directly rather than spending recording time in a conversation loop.
5. **Compare practical options.** Search a needed product/service or approve a research action. Read the price/source labels and unknowns. In a mock recording, show sample options as samples.
6. **Choose something for the plan.** Adding an option changes the planning cart and budget; it does not buy it.
7. **Check uncertainty and the next step.** Expand a Risk Guardian explanation, inspect the scenario comparison, or copy an inquiry draft.
8. **Review relevant protection.** Open the contextual If card. A car demo can produce a fictional premium; home requires a connected If provider for an actual quote.
9. **Include protection in the plan deliberately.** Add a recurring proposed expense and see its period and budget impact. Return to My Protection or My projects later.

**The most valuable result to show:** a saved plan containing a selected option, an updated budget, a visible unresolved issue with a preventive action, and a relevant protection proposal. Show this as a decision aid, not a completed transaction.

**Sources:** [creation flow](src/features/create/CreateWorkspace.tsx), [workspace page](src/features/workspace/WorkspacePage.tsx), [service](server/src/service.ts), [protection flow](src/features/workspace/ProtectionSection.tsx).

## 5. What the AI actually does

### Trigger, context, and output

| Trigger | Information used | Result | What must not be implied |
| --- | --- | --- | --- |
| Click “Create my workspace” | Initial user goal, locale, stated facts and constraints | A structured project plan, relevant tools, starting tasks, recommendations, and useful questions; server rules validate and reconcile the result. | Not completed shopping research, a booked service, or an insurance quote. |
| Send an assistant message | Active project's facts, budget, preferences, selected items, relevant research, pending questions, and a compact recent conversation | A reply and up to five validated proposed actions. Ambiguous follow-ups may first use structured interpretation. | Not unlimited general-purpose chat; not unrestricted autonomous execution. |
| Run research directly or approve a research proposal | Specific category, location, budget, preferences, and relevant trip/vehicle/owned-item context | In live mode, web-search summaries followed by structured extraction and deterministic filtering/ranking. Results can be limited or empty. | Not independent verification of every source fact, seller, availability, or delivered price. |
| Ask about insurance | Relevant product and saved normalized quote/proposal summary | Explanation and a controlled action to open/review the shared insurance workflow. | Not an official price generated from AI knowledge; not a policy purchase. |

**Important division of labor:** The OpenAI integration uses the Responses API and structured results. Code, not an LLM, performs the budget arithmetic, scenario totals, recurring-premium calculations, protection relevance rules, and risk checks. Seller inquiry drafting is also template-based in the current backend.

### Memory and control

- Saved project facts are the source of truth. Short answers relate to the current project's pending question.
- The system distinguishes explicit facts from assumptions and proposed actions.
- User facts can be saved before a provider call, so an AI failure does not necessarily discard an answer.
- Apply/Dismiss controls gate proposed changes. Direct manual edits and explicit research buttons are user actions, rather than automatic chat execution.
- Retrieved content is treated as untrusted data. The model can select supported tools; it cannot create executable frontend code.
- Finnish personal identity numbers belong only in isolated, consented provider requests. They are not part of saved project facts or assistant context.
- There is no claim of perfect understanding: unusual wording, languages, dates, and conflicting constraints can need clarification.

### The three different recording modes

| Mode | What is real | What is simulated or unavailable |
| --- | --- | --- |
| Backend with OpenAI/live research configured | Actual external model/search requests and persisted application state | Search reports are still not guaranteed current quotes; If access is separately required. |
| Current Railway staging | Actual UI, server workflow, private state, validation, calculations, and quotas | Planner/search providers are mocks. Research listings and car-demo prices are fictional. Live If prices are unavailable. Keep the staging disclosure. |
| Settings → Demo data | Browser-only interactive moving fixture | No server AI/search; no full multi-scenario planner; no Smart Protection car quote workflow. |

The current staging fixture deliberately runs mock providers through the expensive-operation allowance boundary to test quotas without provider charges. A normal backend's local planner/demo search do not themselves make paid model calls.

**Sources:** [AI prompts and orchestration](server/src/ai.ts), [conversation context](server/src/conversation.ts), [research pipeline](server/src/research.ts), [finance](server/src/finance.ts), [access boundary](server/src/access-context.ts), [staging fixture record](server/docs/staging-evidence-2026-10-17/staging-fixture.ts.txt).

## 6. Three strongest demonstrations — safe fictional data

Use these as rehearsable shot plans. Dates below are fictional future examples relative to this briefing; choose future dates at recording time. Do not enter real customer identities or real vehicle registration details.

### Scenario A — A move that respects what I already own

**Purpose:** Prove personalization, a concrete selection, budget arithmetic, and prevention.

**Prompt:**

> I am moving to Turku from Helsinki on 2026-11-15 with €2,000. I already own a bed and desk. I need a sofa and moving services. Pickup is fine; used is fine.

**Steps:**

1. Enter the prompt and click **Create my workspace**. Capture the building transition and workspace reveal.
2. Hold on the €2,000 budget. Show moving services and the explicit furniture need; do not expect an unnecessary bed or desk purchase requirement.
3. Briefly open **Edit details** to show the recorded route/date. Save only if something needs correction.
4. In product research, search **Sofa**, maximum **€250**, with **All** price classes. Leave “New only” and mandatory delivery unset: the backend demo has unknown condition/delivery and those hard constraints can correctly remove its results.
5. On current backend demo research, expect fictional options at €125 and €175 if they pass the constraints. Compare the two and select the €125 option. Keep all demo labels visible.
6. Show the planning cart and budget. With no other selected entries, €2,000 minus €125 is €1,875 remaining. This is before unknown additional charges; the reserve remains separate. Do not describe allocation as spending.
7. Expand the actual delivery/additional-charge warning or another evidence-based alert. Let the viewer read its preventive step.
8. Optionally open **Contact the seller** to show an editable draft. With demo data there is no real listing or seller to contact.
9. Show the contextual home-protection card. Open it and show reused home details and **Live quote unavailable**. Do not invent a home premium to complete this scene.

**Fallback:** Use **Add your own estimate** with “Sofa — filming example,” €125, and an unknown additional charge. It is an estimate, not researched evidence. If scenarios have identical totals, show their missing-data explanation rather than a fictional savings comparison.

**Safe narration:** “It keeps the things I already own, helps me compare what is missing, and shows the next cost I still need to check.”

**Sources:** [moving profile](server/src/scenario-profile.ts), [demo offers](server/src/research.ts), [comparison](src/features/widgets/research/CompareDialog.tsx), [budget](server/src/finance.ts), [home section](src/features/workspace/HomeInsuranceSection.tsx).

### Scenario B — A car purchase with a visible protection cost

**Purpose:** The strongest If-specific payoff: context → explicit sample price → recurring budget proposal → shared overview.

**Prompt:**

> I want to buy a 2018 BMW 320d for €8,000. My monthly budget is €1,500.

These are fictional planning details, not a vehicle listing or a claim that this car is currently available for €8,000.

**Steps:**

1. Create a **separate car project**. Show vehicle-related categories and the contextual car-protection card, rather than moving tasks.
2. Open **Get a price**. Keep **Demo** selected. The vehicle description is reused where supported; confirm missing fields rather than pretending every rating factor is known.
3. Enter **DEMO-001**, answer **No** to anyone under 24 driving, and choose **Up to 15,000 km**. Do not enter an identity number. Optional address fields can stay empty for this demo.
4. Click **See demo price**. Show **Demo quote — not an official If insurance price**.
5. Choose **Demo Basic protection**. Its fixed examples are **€45 Monthly** or **€540 Yearly**. The Extended fictional alternative is €75 Monthly / €900 Yearly. These are software fixtures, not market estimates or If offers.
6. Select Monthly and a **12-month** planning period. Add it to the budget as proposed. Show **€540 over 12 months** and **proposed, not purchased**.
7. Where the recorded monthly budget is available, show **€1,455 after insurance, before other monthly costs**. Do not call that overall affordability: fuel, tax, maintenance, parking, and living costs are not thereby established.
8. Open **My Protection**. The same saved result and proposed expense should appear under the originating car workspace.
9. Optional reliability insert: change the fictional registration and save details. Show that the previous price needs a new request and that its existing budget proposal needs review. Do not imply silent repricing.

**Fallback:** If a real If connection is unavailable, stay in Demo. Never cut from a failed real request to a fictional result while calling it a live If quote. Do not use Settings → Demo data; that older adapter rejects this car workflow.

**Safe narration:** “Protection becomes part of the decision, with a clear price period and an explicit place in the budget. This example price is simulated; no policy is purchased.”

**Sources:** [vehicle fact extraction](server/src/protection.ts), [car panel](src/features/workspace/ProtectionSection.tsx), [fixed demo prices](server/src/car-insurance.ts), [budget confirmation](src/features/protection/BudgetLinked.tsx), [My Protection](src/features/pages/MyProtection.tsx).

### Scenario C — A trip, not a moving checklist

**Purpose:** Prove that the workspace and follow-up conversation adapt to the actual goal.

**Prompt:**

> I want to travel from Helsinki to Rome on 2026-11-20, returning on 2026-11-24, with €900 for two travelers. I want to relax.

**Steps:**

1. Create a travel workspace. Hold on **Rome**, **€900**, and travel categories such as Transport, Accommodation, and Food. Do not expect furniture or moving-service categories.
2. Open details to show the stored route, dates, and travelers. Exact dates are more reliable for recording than relative phrases such as “next month.”
3. Send: **“I just want to chill there, find somewhere to sleep and aviatickets.”**
4. Show relevant accommodation/flight research proposals. They are proposals, not completed searches or bookings. Clarifying genuinely missing information is acceptable; re-asking an already stored budget is not the intended behavior.
5. If allowance permits, approve accommodation research. Current staging returns fictional sample options; a real connected search may return unknown prices or no acceptable result. Never turn the sample €125/€175 values into a claimed hotel-stay or airline fare.
6. Optionally add **“Accommodation — planning estimate”** manually, clearly labelled, to show the same budget mechanics in a different scenario.
7. Show the departure/date-based timeline. The travel-protection card is a review/information step only; it does not request a travel premium.

**Fallback:** End on the two relevant action cards without running either search. This still proves continuity and category relevance and is safer within the public AI allowance.

**Safe narration:** “When the goal changes, the workspace changes. The trip keeps its destination, dates, and budget, and asks for the next relevant step.”

**Sources:** [travel profile](server/src/scenario-profile.ts), [casual-language handling](server/src/conversation.ts), [assistant actions](server/src/ai.ts), [service catalog](src/features/widgets/research/ResearchCatalog.tsx), [timeline](src/features/widgets/ActionTimeline.tsx).

## 7. Visual highlights for a premium edit

| Shot | Why it works visually | Direction and accuracy guard | Source |
| --- | --- | --- | --- |
| Landing hero | Bold black headline, yellow highlight, soft floating illustrations | Use a slow push-in; the typing placeholder is decorative, not a model response. | [Hero](src/features/landing/Hero.tsx) |
| Scrolling workspace reveal | Tilt/scale transition gives a polished product introduction | Suitable for atmosphere only. The miniature budget and task counts are illustrative. Cut to the real workspace for evidence. | [ProductReveal](src/features/landing/ProductReveal.tsx), [preview](src/features/landing/WorkspacePreview.tsx) |
| Building → workspace | Clear transformation from a request into a structured interface | Capture the actual returned project; trim waiting time without claiming a measured generation speed. | [creation](src/features/create/CreateWorkspace.tsx), [grid entrance](src/features/workspace/WorkspaceGrid.tsx) |
| Budget chart and selection | A click has a visible financial consequence | Hold the before/after amounts long enough to read; do not mix Remaining with Available after reserve/proposals. | [BudgetDonut](src/features/widgets/budget/BudgetDonut.tsx), [BudgetWidget](src/features/widgets/BudgetWidget.tsx) |
| Offer comparison | A crisp two-column choice is immediately understandable | Preserve price/source/demo labels; placeholders are expected when no real photo was supplied. | [CompareDialog](src/features/widgets/research/CompareDialog.tsx), [OfferImage](src/features/widgets/research/OfferImage.tsx) |
| Risk “Why” expansion | Turns a warning into an understandable action | Show a real issue produced by the recorded plan. Do not add invented risk probabilities in the edit. | [RiskGuardian](src/features/widgets/RiskGuardian.tsx) |
| Task tick and progress ring | Satisfying, legible proof of a saved action | A completed checklist task is not proof of a booking, inspection, or policy. | [TaskList](src/features/widgets/TaskList.tsx) |
| Customize movement | Cards move smoothly without leaving the workspace | Use actual up/down or hide controls, not a fabricated drag gesture. | [WorkspaceGrid](src/features/workspace/WorkspaceGrid.tsx) |
| Smart Protection price → budget | The clearest sponsor-relevant product moment | Keep fictional source, billing period, horizon, and “proposed” visible in the same sequence. | [ProtectionSection](src/features/workspace/ProtectionSection.tsx), [BudgetLinked](src/features/protection/BudgetLinked.tsx) |
| My Protection / mobile insert | Provides closure and shows coherence across screens | Separate workspaces must remain visibly separate. The overview is not an official policy portfolio. | [MyProtection](src/features/pages/MyProtection.tsx), [AppShell](src/features/shell/AppShell.tsx) |

**Visual language:** Use the existing warm gray/white canvas, black typography, blue accents, yellow highlight, rounded cards, Inter interface type, and Source Serif editorial copy. Favor restrained motion, readable pauses, and a few purposeful close-ups. The app already supplies the motion; a dense montage would hide its value. [Design tokens](src/index.css), [motion helpers](src/features/landing/motion-kit.tsx).

## 8. Defensible differentiators

These are observable design choices, not claims that no competitor has them.

- **A workspace rather than a chat transcript alone:** The result is made of editable tools and saved decisions.
- **Context changes the plan:** A car purchase and a trip are not moving templates with different titles.
- **AI interpretation plus deterministic arithmetic:** Language helps organize the goal; application code calculates the amounts.
- **Uncertainty is part of the interface:** Unknown fees and unsupported facts remain visible instead of being treated as zero or certainty.
- **Protection appears in the decision context:** Insurance planning can reuse relevant home or vehicle information and connect a returned/sample premium to a budget.
- **The same insurance record appears in chat, workspace, and overview:** There is one underlying planning state, not three disconnected quote screens.
- **Consequential steps remain explicit:** Planning does not masquerade as buying, booking, or sending.

**Sources:** [registry](src/features/workspace/registry.tsx), [profiles](server/src/scenario-profile.ts), [finance](server/src/finance.ts), [research evidence](server/src/research.ts), [protection service](server/src/protection.ts), [action handling](server/src/service.ts).

## 9. Technical story — only what matters to judges

**Simple architecture:** Browser → application server → saved project and, when configured, authorized external providers.

- **React and TypeScript** provide the visible workspace. Motion powers transitions; the interface adapts to desktop and mobile.
- **Fastify on Node.js** runs the backend. AI and insurer credentials stay on the server.
- **OpenAI Responses API with structured outputs** turns language into validated planning data and proposed actions. A fixed registry limits which workspace tools can appear.
- **Shared Zod contracts** check data exchanged between the interface, server, and integrations.
- **Financial functions use integer euro cents** to keep arithmetic consistent.
- **If home/car provider adapters** normalize supported Finnish API responses. Their presence is an integration foundation, not evidence that partner access has been granted.
- **Railway hosts separate web and API services.** Public staging uses a same-origin proxy, private session cookies, project ownership, and durable SQLite limits alongside JSON project files on a persistent volume.
- **Current operating constraint:** One API process/replica. This is a working prototype architecture, not a demonstrated high-scale platform.

**Judge-facing line:** “AI understands the request; validated services manage the plan; deterministic code calculates the money; the user approves the next action.”

**Sources:** [frontend packages](package.json), [backend packages](server/package.json), [AI](server/src/ai.ts), [contracts](shared/contracts/index.ts), [repository](server/src/repository.ts), [security store](server/src/security-store.ts), [public proxy](deploy/Caddyfile.public).

## 10. Known limitations and recording risks

| Issue or limitation | Consequence during recording | Safe response |
| --- | --- | --- |
| Current staging providers are mocks | It is not footage of a live OpenAI or insurer response. Some generic status badges still describe configured planner/research capability. | Preserve the conspicuous staging disclosure; narrate the prototype workflow accurately. |
| Older browser-only Demo data is moving-specific | Travel/car requests can incorrectly look like moving fixtures; car protection cannot run there. | Keep Settings on the server-backed service for the staged multi-scenario film. |
| No live If credentials in staging | Home/live car requests cannot yield real premiums. | Use car Demo; show home as a prepared form with unavailable status. Do not invent success. |
| Live research is variable and conservative | Results may be empty, unpriced, generic provider pages, or slow. A research run can take up to its configured timeout, usually 90 seconds. | Rehearse the actual query with authorized access, or explicitly use sample data/manual estimates. Never label placeholder results as live. |
| “Source checked” is limited provenance | A citation is not independent verification of the page, seller, current price, or availability. Live reported prices are marked estimated. | Say “sourced options to check,” not “verified best offers.” |
| No live listing photographs in current extractor | Product cards may contain neutral icons and “No photo in listing.” | Use the actual interface. Do not insert a fabricated listing photo and imply it came from the source. |
| Hard filters can remove demo results | Demo condition/delivery are unknown; new-only or required-delivery searches may have zero options. | For sample sofa footage use All, no new-only requirement, and pickup acceptable. |
| Scenario estimates may be identical | No defensible price difference exists without suitable real offers. Demo research is excluded from automatic real-offer selection. | Show trade-offs/missing data or omit this shot. Never invent a savings percentage. |
| Catalog reuse is not fully polished | Product-class controls still use furniture terminology in some non-furniture contexts. | Frame the relevant result, not a claim of a fully bespoke interface for every vertical. |
| Some controls are browser-local | Priority stars, selected scenario, collapse state, and price-class preference are not account-wide decisions. | Do not promise cross-device synchronization of these choices. |
| Reproduced moving-route parser bug in local/mock mode | “I am moving from Helsinki to Turku…” preserves the origin but can leave the destination empty, blocking research until it is supplied. | Use the rehearsed wording “moving to Turku from Helsinki,” or fill Destination in Edit details. This briefing documents the bug without changing code. [Destination extraction](server/src/scenario-profile.ts). |
| Questions, parser, and scope have boundaries | Unusual phrasing, unsupported date formats, and contradictions can need clarification. The UI is mainly English. | Use the exact rehearsed English prompts and explicit future dates. |
| Public beta has limited provider calls | Five provider invocations per UTC day, not five guaranteed conversations. Real research can use two model calls plus hosted search work. | Prepare footage within the allowance. Do not clear cookies to evade limits; arrange an approved recording setup or use mock providers. |
| Proxy-shared rate limits | Several visitors can share the same IP bucket and slow each other down. | Record in a quiet window; pause after a rate-limit response. |
| Anonymous access has no recovery | Clearing cookies can lose access; a project URL alone is insufficient. Production public rollout is not complete. | Use one dedicated recording profile and keep its session. |
| No verified backup restoration in the staging report | Restart persistence passed, but backup restore remains blocked by account/access prerequisites. | Do not claim production readiness, disaster recovery, or a completed public launch. |
| Scenario bulk-add uses several requests | A failure can leave earlier additions saved. | Prefer a single clear selection on camera and inspect the plan before retakes. |
| Insurance budget ≠ full cost of ownership | Other ongoing expenses can still be unknown; net/gross and billing labels matter for real provider data. | Show only the supported arithmetic and its exclusions. |

### Verification evidence and its limits

The existing [Railway staging report](server/docs/RAILWAY_STAGING_RESULTS.txt) records **228 passing backend tests** and **131 passing remote assertions**, successful builds, and restart/isolation checks. It also records the backup limitation and absence of paid provider calls. These are engineering checks, not customer traction or impact statistics.

Additional coverage exists in [conversation recovery tests](server/tests/conversation-recovery.test.ts), [research tests](server/tests/research.test.ts), [finance tests](server/tests/finance.test.ts), [protection tests](server/tests/protection.test.ts), and [browser tests](tests/ui/). Earlier [verification notes](server/docs/VERIFICATION.md) describe variable live-search observations, but some storage/authentication descriptions there predate public-access work. Current source and the newer staging report take precedence.

For this briefing, three credential-free rehearsals used the real project service with transient in-memory storage, local planning, and demo providers. The revised moving prompt preserved its destination and owned inventory; two sample sofas produced the stated budget arithmetic. The car prompt preserved purchase/monthly budgets, and its demo premium produced the stated recurring proposal and monthly remainder. The travel prompt preserved dates, travelers, and budget and produced separate accommodation/transport actions. All three revised flows passed. The first moving wording reproduced the destination-parser bug listed above; no application code was changed to hide it.

These are service-level rehearsals, not a fresh browser or live-provider certification. No full test suite was rerun for this document; the larger counts above come from the cited staging report. Earlier keyboard and Edit details fixes are present; do not revive the old bugs as a dramatic before/after without separately captured evidence. [Keyboard handling](src/lib/keyboard.ts), [details dialog](src/features/workspace/ProjectOverview.tsx), [focus tests](tests/ui/focus.spec.ts).

## 11. Safe recording setup

### Recommended location

**Existing test URL:** https://web-public-access-staging.up.railway.app/app  
For the animated landing page, use the same origin at `/`.

This is the isolated mock-only environment documented in the staging report, not permission to change production or remove its safety controls. Availability and remaining allowance should be checked before the shoot.

### Before capturing

1. Use a dedicated browser profile with only fictional recording workspaces. Close unrelated tabs and notifications. Record the application viewport, not developer tools, terminal windows, browser storage, or Railway settings.
2. Keep **Settings → Live service** selected to use the real backend workflow. On this staging site, that means server-backed state with mock external providers; it does **not** mean live market or insurance data.
3. Check the visible allowance before beginning. Prepare the main project once; reopen it for retakes rather than creating duplicates.
4. Keep every staging, Demo, estimate, source, and “not purchased” disclosure readable. Cropping to an app close-up must not remove the disclosure relevant to that shot.
5. Use the prompts above and fictional `DEMO-001`. Never type a real identity number, payment detail, private address, customer name, real registration, or insurer credential.
6. Do not open administrator controls on camera. An administrator key is neither a customer login nor an AI-provider key. Do not show shared API tokens, session cookies, network headers, or private workspace lists.
7. Do not use an administrator session for footage of “My projects” or “My Protection”; it may reveal other or legacy records. The recording profile should be an ordinary anonymous visitor.
8. Use 1440×900 or a comparable desktop viewport; record a short separate mobile insert. Keep type large enough to read in the final 1080p export. Avoid changing reduced-motion/accessibility settings without the operator's consent.
9. Leave external source links unopened while recording unless the target page has been checked for personal data, availability, permissions, and tracking overlays. A source link is optional in the mock footage because fictional offers have no real listing.
10. Do not switch to a real insurer request or a paid model merely to improve a shot. That needs separately authorized access, consent, and an agreed recording budget.

### A small staging call plan

For the documented mock fixture, a compact session can fit the default five-provider-call allowance:

- Moving creation: 1; one direct sofa search: 1.
- Car creation: 1. Demo car price/budget/overview are not OpenAI calls.
- Travel creation: 1; one contextual assistant reply: 1.
- Stop at the travel proposals rather than confirming further research.

That is a recording plan for this fixture, not a promise that a real model configuration uses exactly one call per message. Avoid additional AI-driven retakes. Manual edits, checklist changes, cart operations, scenario arithmetic, and viewing saved records do not require an OpenAI response.

### Retakes and disclosures

- Start each take from a known saved state. A refresh restores a plan, not the original empty project.
- Use captured real states for before/after edits. Do not fabricate a backend result in post-production.
- Disclose a prototype/demo in an opening caption, and keep specific sample-price labels in the relevant price shots.
- If speeding up a wait, use an unobtrusive time-compression cue; do not claim “instant” or a measured response time.
- Do not use the staging link as evidence that production public launch, live insurance access, or production backup readiness is complete.

**Sources:** [staging report](server/docs/RAILWAY_STAGING_RESULTS.txt), [session boundary](src/features/access/SessionBoundary.tsx), [server limits](server/src/security-store.ts), [demo provider](server/src/car-insurance.ts), [provider request privacy](server/src/if-insurance.ts).

## 12. Suggested 120-second video

### Editorial priorities

Prove four things, rather than trying to tour every feature:

1. One clear request becomes a relevant workspace.
2. A real interface action changes the financial plan.
3. A visible uncertainty leads to a practical preventive step.
4. If-related protection fits into the decision and its budget, with honest source labels.

### Shot-by-shot structure

| Time | Picture | Message / proof |
| --- | --- | --- |
| 0–8s | Quiet hero shot; a few contextual illustrations | Life decisions need more than scattered tabs. Opening caption: **Prototype demo · simulated provider results**. |
| 8–23s | Enter the moving prompt; show the actual workspace-building transition | One situation becomes a saved, structured plan. |
| 23–38s | Moving overview and budget; a brief owned-item/detail view | Relevant categories and constraints are retained; there is no mandatory bed/desk repurchase. |
| 38–54s | Two clearly fictional sofa options; compare, then add one | A choice changes the planning cart and visible budget. Hold the arithmetic. |
| 54–67s | Expand one actual risk and its suggested preventive action; brief checklist tick | The plan exposes what still needs checking. |
| 67–80s | Clear transition to a **separate Car purchase workspace**; open Smart Protection | Protection is relevant to this life event; it is not an intrusive unrelated offer. |
| 80–101s | Explicit Demo request → sample €45/month → 12-month proposed expense | Keep source, billing period, €540 horizon total, and “not purchased” readable. |
| 101–111s | My Protection, with link to the car workspace | Shared planning state, not an official If policy account. |
| 111–116s | A prepared travel workspace or its relevant follow-up action cards | Quick proof that different goals produce different planning contexts. No claim of a booked trip. |
| 116–120s | Logo and current tagline | Close on user confidence and control, not a transaction-success screen. |

### Narration draft

> Moving home, buying a car, planning a trip. Big decisions bring small details that are easy to miss.
>
> Life Simulator turns a practical goal into a workspace you can use.
>
> I’m moving to Turku with two thousand euros. I already have a bed and desk, but I need a sofa and help moving.
>
> The plan keeps those details together: a budget, the next tasks, and relevant options to explore.
>
> I can compare an option, add it to my plan, and see what remains. These sample prices demonstrate the workflow; they are not live market offers.
>
> Risk Guardian makes the unknowns visible, like an additional charge that still needs confirming. Each warning comes with a practical next step.
>
> When I plan a car purchase, protection becomes part of the same decision. The prototype connects to If insurance workflows, with live pricing dependent on authorized access.
>
> Here, a clearly labelled fictional car-insurance example shows forty-five euros a month. I choose twelve months and add five hundred and forty euros as a proposed expense. No policy is purchased.
>
> My Protection brings the saved recommendations and prices together. A travel project gets a different workspace, with its own context.
>
> Life Simulator. Your life, beautifully planned. Clearer choices, with you in control.

The narrator should rehearse timing; leave breathing room for the price and budget proof. If the film uses genuinely authorized live footage instead, revise the sample-data line to match the exact recorded source. Do not simply remove it.

### Claim guide for the edit and voice-over

| Defensible wording | Avoid |
| --- | --- |
| “A relevant plan with editable costs and tasks.” | “It handles your entire life automatically.” |
| “Compare sourced options and check the original information.” | “The cheapest verified offer on the market.” |
| “An estimate,” “reported price,” or “fictional demo quote,” as appropriate. | “Your guaranteed price” over mock or uncertain data. |
| “A proposed recurring expense.” | “Insurance purchased,” “you are covered,” or “policy activated.” |
| “Designed to help spot missing information before a decision.” | “Prevents accidents” or “reduces claims” as a measured fact. |
| “If-related insurance planning, with authorized APIs when connected.” | “Official If partner,” “approved by If,” or “live If integration” over a demo result. |
| “Different workspaces for different goals.” | “Any life event, fully automated.” |

**Final creative recommendation:** Lead with a relatable moving problem. Earn trust with one visible budget change and one honest warning. Make the car-protection-to-budget sequence the sponsor-relevant climax. Let the travel insert establish breadth. Finish on a plan the user understands, rather than implying a purchase the software never made.
