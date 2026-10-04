# Summary

<!-- What changed and why. Link the issue if there is one. -->

## Verification

<!-- Commands you ran and what you saw. For check changes, the fixture and the observed status. -->

## Checklist

- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass locally
- [ ] Tests added or updated under `tests/unit` or `tests/integration` for new behaviour
- [ ] New or changed check: fixture under `fixtures/sites/` with an `expect` entry in its `fixture.json`
- [ ] New or changed check: row in `docs/SCORING.md` (id, weight, reference, detection rule, thresholds labelled FACT / INFERENCE)
- [ ] Any weight, threshold or verdict rule change: `METHODOLOGY_VERSION` bumped in `src/types.ts` and `docs/SCORING.md` heading updated
- [ ] JSON shape change: `RESULT_SCHEMA_VERSION` bumped
- [ ] `CHANGELOG.md` entry under `Unreleased`
- [ ] Docs updated where behaviour changed (`README.md`, `docs/BEHAVIOURAL-TESTING.md`, `action/README.md`)
- [ ] No real brands, personal data or external requests in fixtures or examples
