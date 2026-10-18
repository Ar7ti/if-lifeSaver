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
