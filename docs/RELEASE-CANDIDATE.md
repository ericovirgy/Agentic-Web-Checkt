# Release candidate checklist: v0.1.0

Date: 2026-10-05. Candidate commit: `ad6fc89` on `main` (also on `claude/vibrant-mayer-gekc0f`).
Status values: PASS, FAIL, BLOCKED, NOT TESTED. Evidence is cited by command, run id or file.

| Item | Status | Evidence |
|---|---|---|
| Repository | BLOCKED | Remote is still `ericovirgy/Agentic-Web-Checkt`; every reference in docs, package metadata, action and launch material already uses `ericovirgy/agentic-web-check`. Rename via GitHub API was refused: "Repository settings writes are not permitted through this proxy" (HTTP 403). Manual action: Settings > General > Repository name > `agentic-web-check`; then `git remote set-url origin https://github.com/ericovirgy/agentic-web-check.git`. The only remaining mentions of the old name are the historical naming research (`docs/research/05-naming.md`), the competitive matrix note and the launch checklist blocker itself. |
| Branch state | PASS (with one manual step) | `main` created from the finished implementation with full history preserved (no rewrite): `git push origin HEAD:refs/heads/main`; every later commit pushed to both branches, so `main` and `claude/vibrant-mayer-gekc0f` point at the same commit. Default branch is still `claude/vibrant-mayer-gekc0f` because the setting cannot be changed through the available tooling: Settings > General > Default branch > `main`. |
| CI | PASS | Real GitHub Actions runs on `main`: run 37267106904 (commit f0ff3ce) succeeded with both jobs (`Lint, typecheck, test, build` and `Self-check (action against fixture site)`). Two later runs failed on real defects found by CI and fixed: unformatted dataset JSON (run 37266815174) and the terminal sanitiser stripping the renderer's own colours when colour is forced (run 37267809454). Final run on `ad6fc89`: see the update line at the end of this file. |
| Package | PASS | `npm pack` tarball (0.1.0): 9 files (dist/cli.js, dist/index.js, maps, index.d.ts, docs/SCORING.md, README.md, LICENSE, package.json), 325 kB packed, 1.3 MB unpacked. Installed into a fresh temp project; `npx agentic-web-check ci <fixture> --tasks default --fail-under 70` exited 0 with results.json, report.html, summary.md, badge.svg and screenshots; `npx awc --version` prints 0.1.0. package.json has name, version, bin (agentic-web-check, awc), engines node>=20, license MIT, repository, homepage, bugs, publishConfig (public, provenance). Not published. |
| CLI | PASS | `scan`, `test`, `ci`, `report`, `checks` covered by `tests/integration/cli.test.ts` (exit codes 0/1/2, artifacts, 43 checks listed) and by the self-check job on the runner. |
| Behavioural agent | PASS | Baseline agent: fixture tasks (all 8 sites) and 16 real sites; verdicts PASS/FAIL/BLOCKED produced only by programmatic assertions (`src/tasks/assertions.ts`), BLOCKED by runner guards (captcha, bot wall, login, consent overlay, consequential step, HTTP error). LLM agent: scripted mock providers in `tests/integration/llm-agent.test.ts` and `tests/unit/llm-provider.test.ts`. |
| Real model | PASS (one run, one small model) | Workflow run 37266821107, job 111625298622, GitHub-hosted runner, Ollama `qwen2.5:3b` on CPU via the OpenAI-compatible endpoint, fixture `excellent`, default tasks: contact PASS (2 steps, 130.7 s, answer `hello@northwind.example`), legal-policy FAIL (step budget exhausted without `finish`; criteria held on the final page, verdict FAIL by rule), help-or-about BLOCKED (model clicked "Checkout", consequential guard). Total 498 s. Anthropic/OpenAI hosted APIs not tested (no key in this environment). Details: `docs/validation/real-world-2026-10-05.md`. |
| Real-world scans | PASS | 16 public sites across static, e-commerce demo, SPA, docs, developer tooling, SaaS, reference, public institution and news; all completed, no crash, no INCONCLUSIVE; run 37267818598 (job 111628239512). Two false positives found and fixed in `ad6fc89` (fixed hero counted as a blocking overlay; archetype URL criteria matching keywords inside article slugs). Record: `docs/validation/real-world-2026-10-05.md`. Not a benchmark; no aggregate published. |
| Scoring | PASS | Audit in `docs/SCORING.md` §1-2 (sensitivity table, gate, breadth note) with regression tests (`tests/unit/scoring.test.ts`, `tests/unit/reports.test.ts`): consequential opt-out blocks excluded from the TASK SUCCESS denominator, other BLOCKED counted as not passed, INCONCLUSIVE excluded and "verified" wording withheld when nothing counted, start page HTTP error gates every other check (overall 0), task-outcome line under the overall, crashed checks always listed, scored counts per dimension, extremes stay in 0..100. |
| Security | PASS (review done, findings fixed or documented) | `docs/SECURITY-REVIEW.md` (15 findings). Fixed: iframe subtrees omitted from the LLM-facing snapshot (HIGH), linear robots.txt matching (ReDoS), markdown/terminal/PR-comment sanitisation, no `pull_request_target`, bot-only sticky comment lookup, downloads disabled, credential-free URLs, redacted provider errors, safe hrefs in the HTML report, per-tool-call step budget. Documented as boundary assumptions (not fixed by design): the scanner visits any URL including private hosts and follows redirects; in-page measurement can be tampered with by a hostile page; `version: latest` in the action installs the current npm release. `pnpm audit --prod`: clean. |
| Documentation | PASS | README, docs/SPEC.md, docs/SCORING.md, docs/BEHAVIOURAL-TESTING.md, docs/SECURITY-MODEL.md, action/README.md, benchmark/README.md, CHANGELOG, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT audited against the code on 2026-10-05; Playwright MCP wording backed by `microsoft/playwright` `packages/playwright-core/src/tools/backend/tab.ts` (release-1.63); Lighthouse 13.x Agentic Browsing facts from its `default-config.js`; AgentReady standard acknowledged; no "first"/"only" claims. |
| Action | PASS (experimental) | Composite action ran on real runners: self-check job in every CI run (`version: local`, fixture site, `tasks: default`, `fail-under: 70`, `fail-on-task-fail: true`, outputs asserted) and the validation workflow. Labelled "Experimental GitHub Action"; no third-party use yet; major tag `v0` to be created by the release workflow. |
| Benchmark | PASS (harness) / NOT TESTED (public dataset) | Harness verified locally and on the runner: loads datasets, serves fixtures, runs N scans, stores `run-N.json` per entry, writes `aggregate.json`, `summary.md`, `manifest.json` (tool, methodology, harness, node, browser, git commit); two-run smoke on three fixtures showed 0% flakiness. Three datasets kept separate: `dev-fixtures` (fixture validation), `real-world-validation` (release validation), `public-sample` (public benchmark, NOT executed; no numbers). |
| Launch materials | PASS (reviewed, not published) | `docs/launch/` audited: canonical repository URL, no unsupported numbers, benchmark statistics attributed to secondary sources, experimental action wording, limitations present. Nothing published. |
| Known limitations | PASS (documented) | README "Limitations", docs/SECURITY-MODEL.md "Known boundary assumptions", this file. Chromium only; few pages; heuristic thresholds marked INFERENCE; baseline agent is a floor; LLM results non-deterministic; WebMCP detection relies on a registerTool stub and `form[toolname]`; llms.txt/WebMCP checks reflect publication not usage; no CAPTCHA solving. |

## Test matrix (local, commit ad6fc89, Node v22.22.0, Chromium 141 via AWC_BROWSER_PATH)

| Step | Result |
|---|---|
| `npx biome format .` | no changes |
| `npx biome check .` | 0 errors (1 info) |
| `npx tsc --noEmit` | clean |
| `pnpm test:unit` | 10 files, 223 tests passed |
| `pnpm test` (unit + integration, browser) | 14 files, 413 tests passed |
| `pnpm build` | ESM + DTS success |
| `npm pack` + fresh install + CLI run | pass (see Package) |
| Benchmark smoke (`pnpm bench --only excellent,webmcp,unsafe --runs 2`) | 3/3 entries, flakiness 0% |

## Remaining blockers before tagging v0.1.0

1. Rename the repository to `agentic-web-check` and set `main` as the default branch (manual, GitHub settings).
2. Add the `NPM_TOKEN` secret for the release workflow (publishing is deliberately not done yet).

## Update log

- 2026-10-05: file created at commit ad6fc89; final CI and validation runs on this commit pending (updated below when complete).
