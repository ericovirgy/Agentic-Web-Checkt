# Launch strategy: Agentic Web Check v0.1.0

Status date: 2026-10-05. Evidence base: repository state at `a8f29de`, npm `agentic-web-check@0.1.0`
(latest), tag `v0.1.0` at `58be1e2`, GitHub Release with `agentic-web-check-0.1.0.tgz`.

## 1. Launch status (verified 2026-10-05)

| Area | Status | Evidence | Action |
|---|---|---|---|
| Repository | Public, MIT, default branch `main`, 1 star, 0 forks, 0 watchers, 0 open issues | GitHub REST `repos/ericovirgy/agentic-web-check` | Do not claim traction |
| npm | `0.1.0` published, dist-tag `latest` = `0.1.0` | `npm view agentic-web-check version dist-tags` | None |
| Provenance | None for 0.1.0 (manual publish) | `docs/RELEASE-CANDIDATE.md` | Never claim it. OIDC path unproven until the next real version |
| Tag and release | `v0.1.0` at `58be1e2`; asset `agentic-web-check-0.1.0.tgz` (341479 bytes, sha256 `2d491afd...ac973cc7`) | `gh release view v0.1.0` | None. Body is the CHANGELOG section |
| CI | `main` green: lint/typecheck/test/build and action self-check; Release run on `v0.1.0` green | `gh run list`, check-runs for `main` | Re-check on the day before T0 |
| README first 30 seconds | Has a real command and real fixture output. Headline reads "Lighthouse for AI agents." | `README.md` lines 1 to 60 | Replace the tagline (see Pre-launch fixes) |
| README claims | 43 checks, six scored dimensions plus TASK SUCCESS when tasks run. Consistent with CHANGELOG and terminal sample | `CHANGELOG.md`, `docs/examples/terminal-output.txt` | None. Keep "six dimensions + task success" wording everywhere |
| Benchmark harness | `benchmark/run.ts` exists. `dev-fixtures` runs offline. `public-sample` (12 sites) NOT executed | `benchmark/README.md`, dataset descriptions | Do not publish numbers |
| Validation | 16-site baseline run, two runs, plus `qwen2.5:3b` smoke task, recorded as validation, not benchmark | `docs/validation/real-world-2026-10-05.md` | Call it validation. Fix: the table lists 15 rows, `bbc` appears only in the notes |
| Validation workflow | `.github/workflows/validation.yml`, manual, artifacts only | file | None |
| CONTRIBUTING, SECURITY, CoC | Present. Community profile reports all of them plus issue and PR templates | GitHub community profile | None |
| Examples | `examples/tasks.yaml`, `docs/examples/*.json`, 8 fixture sites | tree | Add a "scan your own site in 2 minutes" snippet (optional) |
| Issues | Enabled, 0 open. Templates: bug, false positive, new check | `.github/ISSUE_TEMPLATE` | DONE 2026-10-05: labels `check-accuracy` and `new-check` created |
| Discussions | Enabled 2026-10-05 | REST `has_discussions: true` | Create the first posts and categories (see `docs/launch/github-repo-metadata.md`) |
| Topics | 17 applied 2026-10-05 | REST `topics` | None |
| Homepage / description | Description replaced 2026-10-05 (no leading space, no broken text). Homepage still empty | REST payload | Optional: set homepage to the npm URL |
| `package.json` description | "Lighthouse for AI agents: ..." is frozen in the published 0.1.0 | `package.json`, npm | Cannot change without a new version. Do not cut a release just for this. Fix in the next real release |
| Existing launch drafts | `docs/launch/` (HN, Reddit, X, LinkedIn, blog, checklist) written before this plan | `docs/launch/` | Superseded by `launch/`. They still use the "Lighthouse for AI agents" tagline in the HN title |
| Telemetry / security claim | "No telemetry" in README | `README.md` | Keep. Say exactly what it says |

## 2. Pre-launch fixes (small, non-destructive, owner approval for the Settings ones)

1. README tagline and `description`: drop "Lighthouse for AI agents". Replacement:
   "Open-source browser evaluator for whether AI agents can actually use websites."
2. GitHub About: description, topics, enable Discussions, labels, social preview.
3. Fix the validation doc row count note (15 rows shown, 16 sites run).
4. Decide the first-run story for Chromium (`npx playwright install chromium`), since a cold `npx` run needs it. The README states it, but it sits below the first command. Done on branch `launch/prep` (README line 14).

None of these changes the architecture, checks, weights or package contents.

## 3. Launch readiness score: 57 / 100

| Component | Max | Score | Reason |
|---|---:|---:|---|
| Product works and is installable | 25 | 22 | Published, CI green, real output sample. Deduct for unproven OIDC path and Chromium first-run friction |
| Honest, supportable claims | 15 | 11 | Most claims are scoped. Tagline equivalence claim and frozen npm description lose points |
| Proof of value | 20 | 8 | Fixture contrast is real, validation is real but explicitly not a benchmark. No third-party use, no public benchmark |
| Discoverability surfaces | 15 | 5 | No topics, no Discussions, no homepage, no social preview, 1 star |
| Launch assets | 15 | 8 | Drafts existed; the new `launch/` set closes most of the gap once approved |
| Community and distribution | 10 | 3 | No audience yet, new account signals unknown |

Score rises to about 70 once the pre-launch fixes land, and to about 80 only with an executed,
published benchmark.

## 4. Strategy

Thesis: lead with a question the audience already has ("can an agent actually use my site?"), show
a fixture where good machine-readable signals coexist with total task failure, and invite people to
run the tool on their own site. Earn attention from curators who accept self-submission, then from
people who tried it.

Principles:

- No claim without a file path or URL behind it. No "first", no "only", no equivalence with
  Lighthouse, Playwright MCP, WebMCP or AgentReady.
- The tool is complementary: Lighthouse's Agentic Browsing category reads a page, this tool runs
  tasks and reviews safety in a live browser. Say that, once, and move on.
- Benchmark results do not exist. The hypothesis "static signals may not predict task completion"
  is a question we plan to test, not a finding.
- One channel at a time at the start. Show HN first, because its rules (something others can try,
  written by a human, no vote solicitation) match the product, and because it feeds curators.
- Everything public passes the approval queue in the local, unversioned `launch/private/submission-tracker.md`.

## 5. Phases

| Phase | Window | Goal | Exit criterion |
|---|---|---|---|
| Prepare | T-3 to T-1 | Fix the surfaces, freeze assets, private technical review | Pre-launch fixes done, demo scan reproducible from a clean machine |
| Launch | T0 | Show HN plus owner-run social posts | Post live, owner answering comments |
| Curators | T+1 to T+3 | Free self-submission routes (Console.dev, Changelog, Web Tools Weekly), WebMCP discussion, DEV article | Submissions sent, tracker updated |
| Second wave | T+4 to T+5 | Awesome-list PRs, communities that allow project posts, creator notes | PRs open, replies logged |
| Evidence | T+6 onward | Benchmark story only if executed and final | Run directory committed, claims cite it |
| Follow-up | T+8 to T+14 | One follow-up per target at most, respond to issues, patch false positives | Issues triaged, next version scoped |

See `launch/launch-calendar.md` for the day-by-day plan and `launch/metrics.md` for what to measure.
