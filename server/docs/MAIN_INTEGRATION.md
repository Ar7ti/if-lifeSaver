# Updated main integration — 18 October 2026

This verification supersedes the older counts below. All local branch tips are now ancestors of the integrated feature head, including the moving Protection Timeline branch and the historical Codex backup. No branch was deleted or force-reset.

## Current integrated changes

- Live AI recovery and contextual conversation/research refinements.
- Source-grounded furniture fallback and SerpApi shopping with durable provider quotas.
- Real product images, potential/supported distinctions, stable duplicate identity and conflicting-price safeguards.
- Public cart/insurance DELETE and scenario POST requests send JSON while retaining the existing CSRF boundary.
- Existing public ownership, admin isolation, insurance, Protection Timeline, budget and scenario behavior preserved.
- The older backup's duplicate quote UIs/endpoints and automatic page scraper were reconciled against the newer architecture, not reactivated. Its entire original patch and hashes are preserved in `legacy-branch/`; the official travel specification and additional identity/UUID regression test were retained. See `legacy-branch/README.md` for per-feature decisions.

## Tests executed on the merged source

- Backend: **347 passed**, zero failures.
- Browser: **56 passed**, zero failures: 38 full UI, 5 public access, 3 structured product, 7 research/furniture, 2 SerpApi and 1 anonymous cart/CSRF/scenario test.
- Frontend/backend typechecks and production builds: passed.
- Whitespace/conflict checks: passed.
- Secret review: no real credentials, environment files or session databases added. The archived patch contains historical code and synthetic fixtures, not executable integrations.
- Tests used local/mock providers: **zero paid provider calls** during this merge verification. Previous live-provider evidence remains separately documented in `SERPAPI_SHOPPING.md`.

The public browser suite was copied to a temporary fixture and its ports/origin remapped from 3016/5186 to 3096/5196; all original assertions remained unchanged. This preserved the existing preview on 5186. Research groups ran with fresh fixture servers to respect the unchanged shared 8/minute limit. Other configured tests ran directly using the existing configurations.

## Publication boundary

Read-only inspection confirmed no GitHub source connected to any API/web service in production, mock staging or Live AI Staging. No GitHub Actions workflow exists in this repository. Updating GitHub main is therefore separate from deployment. **No Railway deployment, variable change or production data operation was performed for this merge.**

Local pre-integration branch checkpoints and a private copy of the uncommitted work were created before committing/merging. The main folder was clean before the update. OS metadata changes (`server/.DS_Store`) are preserved locally and excluded from commits. The original backup branch remains available; no resets or force pushes are required.

Machine-readable results: `main-integration/verification.json`.

---

## Earlier integration record

# Main branch integration verification

Date: 18 October 2026.

## Scope

Integrates the existing moving Protection Timeline commit (`30d1cd0`) with the
reviewed public-access, visual shopping, deterministic comparison, Smart Research
v2 and Universal Products v1 work. No feature branch or remote history was
discarded. The timeline's shared-token authentication test and the newer
anonymous ownership/CSRF test are both retained.

Public access, public paid AI and the eBay adapter remain disabled by default.
Existing shared-token deployments keep their authentication mode until explicitly
configured otherwise. No production or staging variables, data or deployments
were modified for this integration.

## Checks on the integrated source

- Backend: **303 passed**, zero failures, skips or cancellations.
- Backend TypeScript check and build: passed.
- Frontend TypeScript check and production build: passed.
- Public-access browser suite: **5 passed**.
- Research v2 browser suite: **3 passed**.
- Structured-product browser suite: **3 passed**.
- Full existing UI browser suite: **38 passed** (3.5 minutes).
- Total browser coverage: **49 passed**, zero failures.
- Secret-pattern review: changed files contain placeholders and synthetic test
  credentials only; no real credentials, session databases or `.env` files were
  added. Documentation uses redacted configuration and fictional demo data.
- Integrated diff whitespace/conflict checks: passed.
- No lint command is configured in either package.

Tests use local/mock/synthetic providers. They do not prove live eBay retrieval,
real insurer pricing or the absence of all possible bugs. No paid provider calls
were made during this verification. Live eBay verification still requires approved
credentials and account permissions; see `UNIVERSAL_PRODUCTS_V1.md`.

## Reproduction

```sh
npm --prefix server test
npm --prefix server run typecheck
npm --prefix server run build
npm run typecheck
npm run build
npx playwright test --reporter=line --output /tmp/main-integration-ui
npx playwright test --config playwright.public.config.ts --reporter=line
npx playwright test --config playwright.research-v2.config.ts --reporter=line
npx playwright test --config playwright.products.config.ts --reporter=line
```

The public suite was run with a temporary configuration remapping its ports from
3016/5186 to 3096/5196 because an existing preview occupied 5186. The preview was
left running. Each additional browser suite used an isolated output directory.

## Deployment boundary

Read-only Railway inspection found no Git repository source configured on either
production service. Their existing deployments remained unchanged. Pushing GitHub
`main` is not a Railway deployment. No GitHub Actions workflows were configured at
verification time; the checks above were executed locally, not claimed as CI runs.

Keep the public beta rollout and live provider activation as separate, explicitly
authorized steps. Existing provider-access and live-research limitations remain
documented in the feature reports.
