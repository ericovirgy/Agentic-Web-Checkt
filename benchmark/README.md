# Benchmark harness

`benchmark/run.ts` runs the scanner over a **dataset** of sites, repeats it a fixed number of
times, and writes raw results plus an aggregate, a markdown summary and a manifest. Its purpose is
to make every number we quote about Agentic Web Check reproducible: same dataset version, same
tool version, same methodology version, same command, same raw files.

## Methodology

### What a run is

A benchmark run is: one dataset file, one agent backend, N scans per entry (`--runs N`, default 1),
one output directory. For each entry the harness

1. resolves the target: a **fixture** entry is served from `fixtures/sites/<fixture>/` by
   `fixtures/server.ts` on `127.0.0.1` for the duration of the scan (a fresh server and port per
   scan); a **url** entry is scanned as-is over the network;
2. resolves the tasks: `"fixture"` takes the `tasks` list from the site's `fixture.json`,
   `"default"` uses the built-in read-only archetypes (`DEFAULT_TASKS`: contact, legal-policy,
   help-or-about), `"none"` runs the deterministic layer only, any other string is a tasks YAML path
   relative to the dataset file, and an inline list is parsed with `parseTaskDefinition`;
3. calls the public `scan()` API N times with `pages` (default 3), the agent (`--agent baseline`
   by default; `llm` needs the usual `AWC_LLM_*` variables), and the browser executable from
   `--browser-path` or `AWC_BROWSER_PATH`;
4. writes each raw `ScanResult` to `<out>/<entry id>/run-<n>.json` (screenshots go to
   `<out>/<entry id>/run-<n>/screenshots/`). A scan that throws is recorded as
   `{ "error": ... }` in the same place and the run continues with the next scan or entry.

Nothing is retried, no scan is excluded, and the harness never changes checks, weights or verdict
rules: it only calls `scan()` and counts.

### How results are aggregated

`aggregate.json` holds, per entry:

- `overall` and each dimension score as `{ mean, min, max, n }` over the completed runs
  (dimensions without a score in a run are skipped for that run, so `n` can be smaller);
- `tasks`: for every task name the number of runs that ended in PASS / FAIL / BLOCKED /
  INCONCLUSIVE, the distinct verdicts observed, and, for fixtures, the verdict the fixture expects;
- `verdicts`: the four counts summed over all tasks and runs of the entry;
- `flakiness`: the share of tasks whose verdict was not identical across all completed runs
  (`null` when fewer than two runs completed);
- `durationMs` statistics, the list of errors, and the raw run files;
- `expectations` (fixtures only): every `expect` check id from `fixture.json` compared with the
  check's observed status in every run, listing the ids whose observed status differs or varies
  (`observed` is `missing` when the check did not run); the same comparison for task `expect`
  verdicts.

Dataset totals are: mean of the entry means (`meanOverall`), the four verdict counts summed,
`taskSuccess = 100 x PASS / (PASS + FAIL + BLOCKED)` (the SCORING.md rule, INCONCLUSIVE excluded),
mean flakiness, and the number of fixture mismatches.

`summary.md` renders the same data as tables: one row per entry, the dataset totals, then a
dimension table and a task table per entry with the mismatching check ids listed verbatim.

`manifest.json` records what produced the numbers: dataset name and version and file, tool version,
methodology version (`METHODOLOGY_VERSION` from `src/types.ts`), result schema version, harness
version, agent and model, runs, pages, Node version, platform, browser name and version, git commit
and whether the working tree was dirty, start/finish timestamps and the output directory.

### Versioning rules

- **Results are only comparable within the same methodology version and tool version.** A
  methodology bump (any weight, threshold or verdict rule change) and a tool release both invalidate
  comparisons with earlier runs. Re-run the dataset; do not mix.
- A dataset is versioned by its `version` field. Any change to its entries (adding, removing,
  changing a URL or a task spec) bumps the version. Runs of different dataset versions are different
  benchmarks.
- The harness version (`HARNESS_VERSION` in `run.ts`) is bumped when the aggregation rules or the
  output layout change.
- **Never claim numbers for a dataset that has not been executed.** `public-sample.json` is marked
  "candidate: not yet executed" in its description and stays so until a run directory exists.
- Real-site numbers are a snapshot: sites change, so a result for a url entry is only meaningful
  with its date and raw results directory.

### Reading the dev-fixtures summary

`dev-fixtures` is the regression dataset for the checks and the baseline agent. The "Fixture
expectations" column compares what each `fixture.json` declares (`expect` per check id, `expect` per
task) with what was observed. A mismatch is a signal to look at either the check or the fixture; the
harness never decides which one is wrong.

## Commands

```bash
# Dev fixtures, baseline agent, one run per entry, output under benchmark/results/
AWC_BROWSER_PATH=/path/to/chrome npx tsx benchmark/run.ts --dataset benchmark/datasets/dev-fixtures.json

# Same through npm
npm run bench -- --dataset benchmark/datasets/dev-fixtures.json

# Three runs per entry to measure flakiness, explicit output directory
npx tsx benchmark/run.ts --dataset benchmark/datasets/dev-fixtures.json --runs 3 --out benchmark/results/dev-fixtures-3runs

# A subset of entries, more pages, explicit browser
npx tsx benchmark/run.ts --dataset benchmark/datasets/dev-fixtures.json --only excellent,spa --pages 5 --browser-path /path/to/chrome

# LLM agent (needs AWC_LLM_PROVIDER / AWC_LLM_MODEL / AWC_LLM_API_KEY / AWC_LLM_BASE_URL as documented for the CLI)
npx tsx benchmark/run.ts --dataset benchmark/datasets/public-sample.json --agent llm
```

Options: `--dataset <file>` (required), `--agent baseline|llm`, `--runs N`, `--out DIR`
(default `benchmark/results/<dataset>-<timestamp>`), `--only id1,id2`, `--pages N`,
`--timeout ms`, `--browser-path PATH` (or `AWC_BROWSER_PATH`), `--quiet`. Progress goes to
stderr; a one-line total and the output directory go to stdout. Exit code 0 when every entry
completed at least one run, 1 when an entry produced no result, 2 on a harness error.

## Reproducing a published run

1. Check out the git commit named in the run's `manifest.json` and install dependencies with the
   lockfile (`pnpm install --frozen-lockfile` or `npm ci`).
2. Use the same Node major version and a Chromium matching `manifest.json` (`browser.version`).
3. Run the exact command from the publication with the same dataset file, `--agent`, `--runs`
   and `--pages`.
4. Compare `aggregate.json`. Fixture datasets should reproduce exactly except for durations;
   real-site datasets drift as the sites change, which is why they carry a date.

## Adding a dataset

Create `benchmark/datasets/<name>.json`:

```json
{
  "name": "<name>",
  "version": "1",
  "description": "What this dataset measures, how the sites were chosen, and whether it has been executed.",
  "entries": [
    { "id": "excellent", "category": "ecommerce", "fixture": "excellent", "tasks": "fixture" },
    { "id": "example-com", "category": "reference", "url": "https://example.com/", "tasks": "default" }
  ]
}
```

- `id` is unique within the dataset and becomes the result sub-directory name.
- `category` is free text used for grouping in the summary (ecommerce, docs, government, spa...).
- Exactly one of `fixture` (a directory under `fixtures/sites`) or `url`.
- `tasks`: `"fixture"`, `"default"`, `"none"`, a YAML path relative to the dataset file, or an
  inline list of task definitions (same shape as a tasks YAML entry; the
  `{ "type": "url", "includes": "..." }` assertion shorthand is accepted).
- Optional `notes` per entry.

Only add public sites that are built for or known to tolerate automated access (test/demo and
scraping-sandbox sites, documentation, public institutions). The scanner uses an honest user agent
and respects robots.txt for page discovery; never add a site whose terms forbid automated access.
Mark a new dataset "candidate: not yet executed" in its description until it has been run.

## Publishing results

Aggregate claims ("the baseline agent passes X% of tasks", "mean overall score Y") are only made
from a run directory produced by this harness, and **every claim must cite**:

1. the dataset name and version (`manifest.json` -> `dataset`),
2. the tool version and methodology version (`manifest.json` -> `tool`),
3. the date of the run (`manifest.json` -> `startedAt`),
4. the raw results directory (committed under `benchmark/results/` for that run, unedited).

`benchmark/results/` is git-ignored except its README; commit a run directory only when its
numbers are published, and never edit a committed run. Numbers for different dataset versions,
tool versions or methodology versions are never put in the same comparison, and no number is ever
quoted for a dataset without a committed run.
