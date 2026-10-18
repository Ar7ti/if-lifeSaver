# Historical backup reconciliation

The branch `codex-wip-backup-20261017-205756` is merged into main history, with its complete original commit patch preserved in `20261017-backup.patch.gz` and checksums in `archive.json`. The branch itself is retained. This is an archive, not executable application code.

## Integration decisions

- The current shared Smart Protection gateway, single car quote workflow, ownership/CSRF controls, identity-number safeguards, budget links and overview supersede the backup's independent car endpoints and `CarInsuranceSection`. Keep the newer implementations and their tests.
- The backup's automatic JYSK/Nettiauto HTML enrichment has no per-source authorization policy and relabels source-listed prices as verified. It conflicts with the current authorized structured-provider strategy. Preserve its original source/tests in the archive; do not activate it or add background scraping.
- Travel quoting in the backup is a separate workflow without the current quote state/persistence/budget integration. It is preserved for review, not exposed as a second active insurance system. Existing travel planning and protection-review metadata remain working. No real travel quote or additional provider access is claimed.
- Retain the travel OpenAPI reference as documentation only. The older car OpenAPI file is semantically identical to the current canonical `server/docs/if/car-fi.openapi.json`; keep the canonical copy. The archive preserves the original filename/content.
- Retain the backup's standalone-identity-versus-UUID regression test without weakening the current identity-number boundary detection.
- Retain the newer multilingual/category-aware research strategy, bounded hosted search, source provenance, SerpApi/eBay routing and financial validation.
- Keep one private `IF_PARTNER_ID` example entry, not the duplicate introduced by automatic merging.

Inspect the preserved patch without applying it:

```sh
gzip -dc server/docs/legacy-branch/20261017-backup.patch.gz | less
git show codex-wip-backup-20261017-205756
```

No historical work or branches were deleted. Reintroducing an archived workflow requires deliberate integration and authorization/security tests, not replaying this patch over the newer application.
