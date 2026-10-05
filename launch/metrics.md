# Metrics

The tool has no telemetry and that is a feature, so several "usage" metrics cannot be measured
directly. Each metric below names its real source and its blind spot. Record weekly, starting at T-1.

## Primary

| Metric | Source | Blind spot |
|---|---|---|
| npm downloads (weekly) | `https://api.npmjs.org/downloads/point/last-week/agentic-web-check` | Includes mirrors and bots; CI installs cannot be separated from humans |
| Installs that look like CI | Not measurable. Proxy: public workflows referencing `ericovirgy/agentic-web-check/action` (GitHub code search) | Private repos invisible |
| Scans and repeat scans | Not measurable without telemetry. Proxy: results shared in Discussions "Show your score", issues with `results.json` | Self-selected |
| Contributors | `gh api repos/ericovirgy/agentic-web-check/contributors`, plus authors of merged PRs and of accepted fixtures | Bots excluded |
| Benchmark submissions | Datasets or runs proposed by others (PRs, Discussions) | Zero until a benchmark exists |
| Integrations | Public repos or docs using the CLI or action; issues/PRs in other projects that mention it | Search-based, incomplete |
| Third-party mentions | Search for the repo URL and package name; HN/Reddit/DEV/newsletter links; record URL and date | Search coverage |
| Backlinks | Referrers in GitHub traffic (owner-only, 14-day window), npm "dependents" page | 14-day window; export weekly |
| Useful issues | Count of issues that are real false positives, bugs or check proposals (not stars-driven noise) | Needs manual labelling |

## Secondary

| Metric | Source |
|---|---|
| Stars, forks, watchers | `gh api repos/ericovirgy/agentic-web-check` |
| Release asset downloads | `gh release view v0.1.0 --json assets` (`downloadCount`) |
| Impressions, followers | Platform analytics on the maintainer's own accounts |
| Repo views and clones | GitHub Insights, Traffic (owner-only) |

## Rules

- Report counts with dates. Never round up, never buy or trade for any of these numbers.
- Stars and impressions are context, not success criteria.
- A launch counts as working if it produces useful issues, a second contributor, or an external
  integration, not if it produces a spike.

## Weekly log template

| Week of | npm dl | Stars | Forks | Open issues (useful) | New contributors | Third-party mentions (URLs) | Notes |
|---|---:|---:|---:|---|---:|---|---|
| 2026-10-05 | baseline | 1 | 0 | 0 | 0 | none known | pre-launch |
