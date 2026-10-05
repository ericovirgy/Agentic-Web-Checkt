# Benchmark methodology (draft for freeze)

This document restates and extends `benchmark/README.md`. Where they differ, `benchmark/README.md`
describes the harness as it exists today and this file describes what a published run must add.

## Definitions

- Run: one dataset file, one agent backend, N scans per entry, one output directory.
- Entry: a site (URL or fixture) with a task specification.
- Verdict: PASS, FAIL, BLOCKED, INCONCLUSIVE, computed from assertions on the final browser state.
- Task success: `100 x PASS / (PASS + FAIL + BLOCKED)`; INCONCLUSIVE excluded (rule in `docs/SCORING.md`).

## Freeze list (everything below must be fixed by commit hash before the run)

1. Tool version and methodology version (`METHODOLOGY_VERSION`).
2. Dataset file and its `version`.
3. Task archetype definitions.
4. Harness version (`HARNESS_VERSION` in `benchmark/run.ts`).
5. Runner image and Playwright Chromium build (recorded in the manifest).
6. Analysis plan (`launch/benchmark-plan.md`, section "Analysis plan").

## Procedure

1. Check out the frozen commit; `pnpm install --frozen-lockfile`.
2. Run the dev-fixtures regression; expectations must match.
3. Execute the public dataset with `npx tsx benchmark/run.ts --dataset <file> --agent baseline --runs 3 --pages 3`, on the GitHub-hosted runner.
4. Commit the run directory unedited under `benchmark/results/`.
5. Generate tables only from `aggregate.json` and `manifest.json`.
6. Publish with the citation block (dataset, versions, date, raw directory).

## Validity threats (state them in every publication)

- Sites are not a random sample of the web.
- Single start page plus up to two linked pages.
- The baseline agent is a floor, not a vendor agent. Results say nothing about any specific product.
- Bot walls depend on the runner's IP range and change over time.
- Sites change daily; a result is a dated snapshot.
- Heuristic thresholds (marked INFERENCE in `docs/SCORING.md`) are defaults, not validated constants.
- The maintainer designed both the checks and the tasks, so circularity is possible. Mitigation:
  publish raw data and invite independent reruns and task proposals.

## Reproduction

Follow "Reproducing a published run" in `benchmark/README.md`. Fixture datasets should reproduce
exactly except for durations. Real-site datasets drift, which is why each carries a date.

## Not allowed

Editing a committed run, mixing methodology versions in one comparison, quoting numbers for an
executed-looking dataset without a committed run, calling validation data a benchmark.
