# Benchmark results

This directory is ignored by git except for this file.

`benchmark/run.ts` writes one directory per run here by default
(`benchmark/results/<dataset>-<timestamp>/`), containing the raw per-run
`<entry>/run-<n>.json` files, `aggregate.json`, `summary.md` and `manifest.json`.

Result directories are committed only for **published** runs, that is runs whose
numbers are quoted somewhere (README, blog post, release notes). A published run is
committed as-is, never edited, and is cited by dataset name and version, tool
version, methodology version, date and this directory's path. See
`benchmark/README.md`, section "Publishing results".
