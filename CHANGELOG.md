# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/). The release workflow publishes the section matching the
git tag as the GitHub release notes.

Results are only comparable within one methodology version; a methodology bump is always called
out under **Changed**.

## [Unreleased]

## [0.1.0] - 2026-10-04

First release. Methodology v1, result schema v1.

### Added

- CLI `agentic-web-check` (alias `awc`) with `scan`, `test`, `ci`, `report` and `checks` commands;
  exit codes 0 (thresholds met), 1 (threshold not met), 2 (runtime error); thresholds
  `--fail-under`, `--fail-on-task-fail`, `--fail-on <ids[:warn]>`.
- Deterministic perception audit in headless Chromium (Playwright 1.63): AI-mode accessibility
  snapshot, selected axe-core rules, live DOM data and an init script recording closed shadow
  roots, click listeners on non-semantic elements, WebMCP `registerTool` calls, mutations and
  layout shift. Start page plus up to `--pages - 1` linked same-origin pages.
- 43 checks across six dimensions (PERCEPTION, NAVIGATION, INTERACTION, MACHINE INTERFACES,
  RELIABILITY, SAFETY), each with rationale, references, remediation and bounded evidence.
  Catalogue in `docs/SCORING.md`.
- Plain HTTP probes with the tool's user agent for `/robots.txt` (RFC 9309 matching for user-triggered
  agent tokens), `/sitemap.xml`, `/llms.txt`, `/.well-known/agent-card.json`, `/.well-known/ucp`,
  `/ai-catalog.json` and the JS-disabled HTML baseline.
- Safety review: hidden instructions aimed at AI systems, unguarded consequential actions, unsafe
  form transport, WebMCP tool annotations, authentication boundary signalling, secret-looking tokens
  (redacted), unannounced downloads and new windows.
- Behavioural task runner with programmatic assertions (`url`, `text`, `title`, `element`, `answer`,
  `navigated`, `any_of`), verdicts PASS / FAIL / BLOCKED / INCONCLUSIVE, blocker detection (CAPTCHA,
  bot wall, login required, consent overlay without a named dismiss control, consequential step,
  HTTP error), step log with truncated snapshots, screenshots and token usage. New tabs opened by an
  action are followed in the main tab when same-origin and closed otherwise.
- `page-load` acts as a gate: when the start page does not load or answers with an HTTP error,
  every other check except `challenge-or-bot-wall` is `na` and the overall is 0; pages answering
  4xx/5xx are excluded from check aggregation.
- Scoring hardening: a `safety: consequential` task that ends BLOCKED only because it ran without
  `--allow-consequential` is excluded from the TASK SUCCESS denominator (an operator choice, not a
  site defect), like an INCONCLUSIVE task; the terminal and markdown reports print a task-outcome
  line whenever a task did not PASS, a note listing checks that crashed and were not scored, and
  per dimension the number of checks scored out of the total.
- `--insecure` flag (`AWC_INSECURE=1`) to accept invalid TLS certificates on staging hosts.
- Manual validation workflow (`.github/workflows/validation.yml`): real-world scans with the
  baseline agent over `benchmark/datasets/real-world-validation.json` and a real-model smoke task
  with Ollama on GitHub-hosted runners. Produces artifacts only; validation evidence, not a
  benchmark.
- Two agent backends over one tool surface: `baseline` (deterministic, no LLM, accessible-name
  matching) and `llm` (OpenAI-compatible chat/completions and Anthropic Messages API over `fetch`;
  `AWC_LLM_PROVIDER`, `AWC_LLM_MODEL`, `AWC_LLM_API_KEY`, `AWC_LLM_BASE_URL`).
- Safety classes `read-only`, `form-submit` (`--allow-forms`) and `consequential`
  (`--allow-consequential`); same-origin `navigate` tool; synthetic task data only.
- Built-in read-only task archetypes (`--tasks default`): contact, legal-policy, help-or-about, each
  requiring `navigated` plus a destination criterion.
- Tasks YAML loader (`tasks:` list; `success` or `assert`; `{ type: ... }` assertion shorthand).
- Scoring: 10/7/3/1 check weights, dimension weights 20/15/20/10/15/20, TASK SUCCESS at 30% when
  tasks run, overall as weighted mean over available dimensions; `suggestedFixes` ordered by
  status and weight.
- Reports: terminal, JSON (`ScanResult`), single-file HTML, markdown summary, SVG badge
  (`Agent Ready · scan` / `Agent Ready · verified (N tasks)`, methodology version embedded),
  `--out` directory with screenshots.
- Experimental composite GitHub Action (`action/`): job summary, sticky PR comment on
  `pull_request` events, artifact upload, thresholds, `version: local` for self-checks. Run so far
  only in this repository's own CI and validation workflow.
- Benchmark harness (`benchmark/run.ts`) with `dev-fixtures` dataset (eight local fixture sites)
  and a `public-sample` candidate dataset (not executed).
- Fixture sites under `fixtures/sites/` (`excellent`, `webmcp`, `spa`, `poor-semantics`,
  `inaccessible`, `ambiguous-ui`, `auth-boundary`, `unsafe`) and a static fixture server.
- Public API (`agentic-web-check` ESM entry): `scan`, `computeScores`, `ALL_CHECKS`,
  `DEFAULT_TASKS`, `loadTasksFile`, renderers and types.
- Research notes under `docs/research/`, product specification (`docs/SPEC.md`) and scoring
  methodology (`docs/SCORING.md`), threat model for running the scanner
  (`docs/SECURITY-MODEL.md`).

### Security

- Downloads are disabled in the browser context (`acceptDownloads: false`); links that would start
  one are reported, not saved.
- Page discovery honours robots.txt `Disallow` rules for the tool's user agent token; path patterns
  are matched with a linear-time matcher, so a hostile robots.txt cannot cause catastrophic
  backtracking.
- The snapshot handed to the `llm` agent omits iframe subtrees, so the model cannot read
  cross-origin frames (including frames on internal hosts); deterministic checks still inspect them.
- Task reasons, page titles, URLs and accessible names have ANSI/OSC escapes and control
  characters stripped before terminal and markdown output; markdown table cells are escaped. The
  Action's PR comment is built from that sanitised summary.
- Credentials embedded in the scanned URL are stripped before the browser and the probes use it.
- The GitHub Action posts comments only on `pull_request` events; `pull_request_target` is not
  supported.

[Unreleased]: https://github.com/ericovirgy/agentic-web-check/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/ericovirgy/agentic-web-check/releases/tag/v0.1.0
