# Benchmark plan (NOT executed)

Decision: do not execute or publish a benchmark before launch. The methodology below must be frozen
and reviewed first. Anything already measured is "validation" (`docs/validation/real-world-2026-10-05.md`).

## Question

Do deterministic perception scores (static signals plus accessibility-tree quality) predict whether
a baseline browser agent completes basic read-only tasks on a live site? Secondary: which failed
checks co-occur with BLOCKED or FAIL task verdicts?

This is stated as a question because no data answers it yet.

## Dataset v2 (proposal: 30 sites)

Start from the 16 entries in `benchmark/datasets/real-world-validation.json` and the 12 in
`public-sample.json` (overlap: saucedemo, vercel-store, books-toscrape, quotes-toscrape, mdn,
example-com, w3, wikipedia, github, playwright-dev, docs-github, gov-uk). Add entries until each
category has at least 3 sites.

| Category | Target count | Selection rule |
|---|---:|---|
| Documentation | 5 | Public docs of open-source projects |
| Public institutions | 4 | Government or standards bodies that publish accessibility statements |
| Reference / encyclopedia | 2 | |
| Ecommerce demo sandboxes | 4 | Sites built for testing (saucedemo, books/quotes toscrape, vercel store) |
| Developer tooling / SaaS marketing | 5 | Public marketing pages only, no logged-in areas |
| News / media | 3 | Report bot walls as a result, do not work around them |
| Static / minimal | 2 | example.com style |
| SPA documentation | 3 | react.dev style, to exercise rendering |
| Small business / nonprofit | 2 | Only with explicit opt-in from the owner |

Preference order: sites that invite testing (demos, sandboxes), documentation and public
institutions, then opt-in volunteers. Excluded: any site whose terms forbid automated access, any
login-gated area, any site that returned a bot wall in a prior run unless it is listed as a bot-wall
category.

## Tasks

Fixed set of three default read-only archetypes (contact, legal-policy, help-or-about) using the
path-segment URL criteria that exist after the validation fixes. Freeze the archetype definitions
by commit hash before the run. If archetypes change, the dataset version changes.

Candidate additions only after a separate review: docs lookup, pricing lookup. Not part of v2 unless
frozen.

## Run design

- Agent: `baseline` (required, reproducible). `llm` runs are a separate, labelled appendix with the
  model id, provider, temperature settings and token counts, never mixed with baseline aggregates.
- Repeats: 3 runs per site on separate days if possible, same runner image, to measure drift and
  flakiness (`benchmark/run.ts --runs 3`).
- Pages per site: 3 (default).
- Runner: GitHub-hosted `ubuntu-latest` via the existing manual workflow, so the environment is
  recorded and public. Note the validation run showed that datacentre IP ranges trigger bot walls
  on some sites (for example npmjs.com); report those as results with the observed status codes.
- Versions recorded in `manifest.json`: tool version, methodology version, dataset version, harness
  version, browser version, Node version, commit, dirty flag, timestamps.

## Outputs

- Raw: `<out>/<entry>/run-<n>.json` plus screenshots, committed unedited under `benchmark/results/<run>/`.
- Aggregate: `aggregate.json`, `summary.md`, `manifest.json` as produced by the harness.
- Publication rule (from `benchmark/README.md`): every claim cites dataset name and version, tool and
  methodology version, run date and raw directory.

## Analysis plan (written before running)

1. Report per-category counts of PASS / FAIL / BLOCKED / INCONCLUSIVE, with n.
2. Report the rank correlation (Spearman) between the deterministic overall score (computed without
   the TASK SUCCESS dimension) and task success per site. Report the coefficient, n and that sites
   are not a random sample of the web.
3. List failed checks most associated with BLOCKED. Descriptive only.
4. Report flakiness (share of tasks whose verdict varied across runs).
5. Any site where the result is a tool false positive (as in the github overlay case in the
   validation) is reported as a methodology issue, fixed in a later methodology version, and the
   original run is kept unedited.

No result is dropped. Failures of the tool are results.

## Ethics and safety

- Read-only tasks only. No `--allow-forms`, no `--allow-consequential`.
- No credentials, no CAPTCHA solving, honest user agent (`AgenticWebCheck/<version>`), robots.txt
  respected for page discovery.
- Low request volume: at most 3 pages and 3 tasks per site per run, three runs.
- Offer site owners a contact route and a removal path in the publication. Notify opt-in sites
  before publishing their results.
- Do not rank or shame named small sites. Publish named results only for sites that are public
  institutions, documentation of projects, or demo sandboxes, or that opted in. Report others by category.

## Go / no-go gate

Run only when: dataset v2 file is committed, archetypes frozen, analysis plan committed, one dry run
on `dev-fixtures` reproduces its expectations, and the maintainer approves. Until then, nothing
here is quoted publicly.
