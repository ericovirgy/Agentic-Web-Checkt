# Contributing

Thanks for helping. This document covers the dev setup, the scripts, and the rules for adding
checks, fixtures and task archetypes. The methodology lives in [docs/SCORING.md](docs/SCORING.md)
and the product contract in [docs/SPEC.md](docs/SPEC.md); read both before changing scoring.

## Dev setup

```sh
git clone https://github.com/ericovirgy/agentic-web-check
cd agentic-web-check
pnpm install --frozen-lockfile        # pnpm 10, Node 22 (package engines: Node >= 20)
npx playwright install chromium       # or: export AWC_BROWSER_PATH=/path/to/chrome
pnpm dev scan https://example.com     # runs src/cli.ts through tsx
```

On Linux CI machines Chromium needs system libraries: `npx playwright install --with-deps chromium`.

## Scripts

| Script | What it does |
|---|---|
| `pnpm lint` | `biome check .` (formatting and lint rules from `biome.json`) |
| `pnpm format` | `biome format --write .` |
| `pnpm typecheck` | `tsc --noEmit` (strict, `noUncheckedIndexedAccess`) |
| `pnpm test` | `vitest run` over `tests/**/*.test.ts`; `test:unit` and `test:integration` scope to `tests/unit` and `tests/integration` |
| `pnpm build` | `tsup` into `dist/` (the published package; `agentic-web-check` and `awc` point at `dist/cli.js`) |
| `pnpm bench -- --dataset benchmark/datasets/dev-fixtures.json` | runs the benchmark harness, see [benchmark/README.md](benchmark/README.md) |
| `pnpm fixtures:serve <site> [port]` | serves `fixtures/sites/<site>/` on 127.0.0.1 and prints the URL |
| `pnpm dev <command>` | runs the CLI from source |

CI (`.github/workflows/ci.yml`) runs lint, typecheck, test, build and `npm pack --dry-run`, then
runs the GitHub Action against the `excellent` fixture with `version: local`. A pull request has to
pass both jobs.

## Adding a check

Checks are `CheckDefinition` objects (`src/checks/framework.ts`) grouped by dimension in
`src/checks/{perception,navigation,interaction,machine,reliability,safety}.ts` and collected in
`src/checks/index.ts`:

```ts
interface CheckDefinition {
  id: string;            // kebab-case, stable forever once released
  title: string;         // one line, states the passing condition
  dimension: Dimension;  // perception | navigation | interaction | machine-interfaces | reliability | safety
  weight: 1 | 3 | 7 | 10;
  rationale: string;     // why this matters to agents, in one paragraph
  references: string[];  // the standard, audit id or failure-mode source
  remediation: string;   // what the site owner should change
  run(ctx: CheckContext): CheckOutcome | Promise<CheckOutcome>;
}
```

`run` receives the loaded pages (snapshot, DOM data from `src/browser/page-data.ts`, axe results),
the plain HTTP probes and the options. It returns `{ status, summary, evidence?, metrics?,
remediation?, pages? }`. Statuses: `pass`, `warn`, `fail`, `na` (not applicable, unscored), `info`
(reported, unscored). Evidence items are bounded (`finalize` keeps 25) and must contain `observed`
and `expected`. A check that throws is recorded as `na` with its error and never takes the scan down.

Admission rule. A check is accepted only if it:

1. **cites a source**: a WCAG success criterion, a Lighthouse audit id, a specification, or a
   failure mode documented in `docs/research/` (benchmark error analyses or agent-harness docs);
   "it seems useful" is not enough;
2. **has a fixture** under `fixtures/sites/` that triggers each status it can return, with the
   expected status declared in that fixture's `fixture.json` `expect` map;
3. **is documented in `docs/SCORING.md`**: a row in the catalogue table with id, weight, reference
   and detection rule, with every threshold labelled FACT or INFERENCE;
4. **has a justified weight**: 10 blocks agents outright, 7 causes frequent failures, 3 degrades,
   1 is a nicety. Explain the choice in the PR.

New data from the page goes into `PAGE_DATA_SCRIPT` (`src/browser/page-data.ts`) or `INIT_SCRIPT`
(`src/browser/init-script.ts`) when it must be recorded before site scripts run. Keep everything
bounded (counts, slices) so the JSON stays small on large pages.

### Methodology version

`METHODOLOGY_VERSION` in `src/types.ts` is embedded in every result and in the badge. Bump it when
any of these change: a check weight, a dimension weight, a detection threshold, a status rule, or a
task verdict rule. Adding a check also bumps it, since it changes dimension scores. Bump
`RESULT_SCHEMA_VERSION` when the JSON shape changes. Bump `HARNESS_VERSION` in `benchmark/run.ts`
when the aggregation or output layout changes. Update the heading of `docs/SCORING.md` and add a
CHANGELOG entry that says what became incomparable.

## Adding a fixture

Fixtures are static sites under `fixtures/sites/<name>/`, served by `fixtures/server.ts`. Each has
a `fixture.json`:

```json
{
  "name": "<name>",
  "description": "What is deliberately right or wrong on this site.",
  "pages": ["index.html", "contact.html", "robots.txt"],
  "expect": { "overlay-interference": "fail", "landmarks": "pass" },
  "notes": { "overlay-interference": "Why the fixture produces this status." },
  "tasks": [
    {
      "name": "find-contact-email",
      "goal": "Find the email address for contacting Northwind Bikes.",
      "safety": "read-only",
      "expect": "PASS",
      "success": [{ "type": "url", "includes": "contact.html" }]
    }
  ]
}
```

- `expect` maps check ids to the status the fixture is designed to produce; the benchmark harness
  compares them with observed results and lists mismatches.
- Tasks use the same shape as a tasks YAML entry plus `expect` (the verdict). The
  `{ "type": "url", "includes": "..." }` shorthand is accepted.
- Use fictional names and `.example` domains. No real brands, no real personal data, no external
  requests (the fixture must work offline).
- `/challenge.html` is served with HTTP 403 by the fixture server; use that path to test bot-wall
  behaviour.
- Add the fixture to `benchmark/datasets/dev-fixtures.json` and bump that dataset's `version`.

Run it: `pnpm fixtures:serve <name> 4311`, then `pnpm dev scan http://127.0.0.1:4311/ --tasks default`.

## Adding a task archetype

Built-in archetypes live in `DEFAULT_TASKS` (`src/tasks/archetypes.ts`). An archetype must be
site-generic: a goal that holds on most sites, `read-only`, with `hints` that are accessible-name
vocabulary and success criteria that do not depend on one site's wording (`url.regex` over common
path words, `any_of` with `element` fallbacks). Add synonym expansions in `EXPANSIONS`
(`src/tasks/keywords.ts`) when the baseline agent needs them, and verify the archetype against
the `excellent` fixture (expected PASS) and at least one broken fixture (expected FAIL or BLOCKED).
Archetypes are part of the benchmark, so adding one bumps the dev-fixtures dataset version.

## Pull requests

- One concern per PR. Describe what changed, why, and how you verified it.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass locally.
- New behaviour has tests under `tests/unit` or `tests/integration` (vitest, `*.test.ts`).
- New or changed checks follow the admission rule above (source, fixture, SCORING.md, weight).
- `CHANGELOG.md` has an entry under `Unreleased`.
- Do not touch `src/`, `fixtures/` and `docs/SCORING.md` in a docs-only PR, and vice versa.

## Commit style

Conventional commits, as in the history: `feat:`, `fix:`, `docs:`, `chore:`, `test:`, `bench:`,
with an optional scope (`docs(research): ...`, `feat(checks): ...`). Subject in the imperative,
under 72 characters. Explain the reasoning in the body when the diff does not.
