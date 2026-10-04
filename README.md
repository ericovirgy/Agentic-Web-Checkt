# Agentic Web Check

**Lighthouse for AI agents.**

Scan a website. Measure how usable it is for AI agents. Get actionable fixes.

[![npm version](https://img.shields.io/npm/v/agentic-web-check)](https://www.npmjs.com/package/agentic-web-check)
[![CI](https://img.shields.io/github/actions/workflow/status/ericovirgy/agentic-web-check/ci.yml?branch=main&label=CI)](https://github.com/ericovirgy/agentic-web-check/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/github/license/ericovirgy/agentic-web-check)](LICENSE)

## 30 seconds

```sh
npx agentic-web-check scan https://example.com
npx agentic-web-check scan https://example.com --tasks default
```

Real output of the second command against the `ambiguous-ui` fixture site shipped in this
repository (a deliberately broken site: cookie wall without a named close button, three buttons
named "Submit", hover-only menus, an unguarded "Delete account" button). Trimmed; the full
output is in [docs/examples/terminal-output.txt](docs/examples/terminal-output.txt).

```text
AGENTIC WEB CHECK  v0.1.0 · methodology v1
http://127.0.0.1:4313/  (fixture: ambiguous-ui)
Behavioural verification (3 tasks, baseline agent)

Agent Readiness   58/100

PERCEPTION           81   6 pass · 2 warn · 1 fail
NAVIGATION           75   4 pass · 0 warn · 2 fail
INTERACTION          77   8 pass · 0 warn · 1 fail
MACHINE INTERFACES   78   2 pass · 1 warn · 1 fail
RELIABILITY         100   5 pass · 0 warn · 0 fail
SAFETY               86   3 pass · 2 warn · 0 fail
TASK SUCCESS          0   0 pass · 0 warn · 3 fail

28 passed  5 warnings  5 failures  5 not applicable/info

FAIL
  ✗ No overlay blocks the page at load [overlay-interference, interaction, weight 10]
    2 overlays block the page without an accessible dismiss control.
    · div#consent · observed: overlay covering 100% of the viewport with no named dismiss control · expected: named Accept/Close/Reject button
  ✗ Control names are specific, not repeated or generic [ambiguous-control-names, perception, weight 3]
    6 generic names and 0 names reused for different destinations.
    · button "Submit" [ref=e36] [cursor=pointer] · observed: generic name · expected: name describing destination or action
    · … 3 more in JSON/HTML report
  ✗ Menus do not depend on hover [hover-only-menus, navigation, weight 3]
    12 navigation links are only revealed on hover.
  ✗ A sitemap is published [sitemap, navigation, weight 3]
  ✗ Structured data (JSON-LD) describes the page [structured-data, machine-interfaces, weight 3]

WARNING
  ! Clickable elements are real controls, not generic elements [fake-interactive-elements, perception, weight 7]
  ! Consequential actions require confirmation [consequential-actions-guarded, safety, weight 7]
    4 of 4 consequential actions execute without a visible confirmation step.
    · button "delete account" · observed: immediate action without confirmation signal · expected: confirmation dialog or review step
  [trimmed: 3 more warnings]

BEHAVIOURAL TESTS
  Find the company's contact information (an email address or phone n…: BLOCKED (0 steps, 0.8 s)
    consent-overlay: div#consent covering 100% of the viewport with no named dismiss control
  Find the page describing the privacy policy or terms of service.: BLOCKED (0 steps, 0.8 s)
  Find a page that explains what the company or product does (about, …: BLOCKED (0 steps, 0.8 s)

Suggested fixes
  1. No overlay blocks the page at load [overlay-interference, weight 10]
     Avoid full-page overlays at load; if a consent dialog is required, make it a role="dialog"
     with a clearly named Accept/Reject button and let the rest of the page work beneath it.
  [trimmed: 7 more fixes]

2 pages · 9.3 s · chromium 141.0.7390.37 · 2026-10-04T21:43:46.062Z
```

## What it measures

The question is: *can an AI agent reliably understand and use this website, and is it safe to
let it?* Three layers answer it.

1. **Perception audit** (deterministic, no LLM, no API key). The page is loaded in headless
   Chromium through Playwright. The tool takes the same accessibility snapshot that Playwright
   MCP and similar harnesses feed to agents (`page.ariaSnapshot({ mode: 'ai' })`), runs a
   selected set of axe-core rules, and evaluates 43 checks against the live DOM and the snapshot.
   Every check is tied to a WCAG success criterion, a Lighthouse audit, a specification, or a
   failure mode documented in agent benchmarks. `agentic-web-check checks` lists them.
2. **Task verification** (behavioural, optional LLM). A task is a goal plus programmatic success
   criteria. An agent drives the browser; the verdict comes from assertions evaluated against the
   final browser state, never from the agent saying it finished.

   | Verdict | Meaning |
   |---|---|
   | PASS | agent reported completion and every success assertion holds |
   | FAIL | agent gave up, exhausted its budget, or reported completion while assertions do not hold |
   | BLOCKED | CAPTCHA, bot wall, HTTP error on the start page, login required, consent overlay without a named dismiss control, or a consequential step reached without opt-in |
   | INCONCLUSIVE | runner error (navigation timeout, browser crash, LLM provider error) |

3. **Safety review** (deterministic). Hidden text that addresses AI systems, consequential
   actions (buy, delete, send, cancel, ...) reachable without a confirmation signal, forms posting
   over HTTP or cross-origin, WebMCP tools without safety annotations, unlabelled login
   boundaries, secret-looking tokens in page source, unannounced downloads and new windows.

## Why not just Lighthouse

Lighthouse 13.x ships an official **Agentic Browsing** category: 7 audits
(`agent-accessibility-tree`, `llms-txt`, `ard-schema`, three WebMCP audits and
`cumulative-layout-shift`) with `categoryScoreDisplayMode: 'fraction'`, so it deliberately has no
0-100 score (see [docs/research/03-competitive-matrix.md](docs/research/03-competitive-matrix.md)).
This project does not re-implement those audits, and it does not add another fetch-and-parse
checklist scanner; the research found more than fifteen of those already.

What it adds: checks at the level of what an agent *perceives* in a live browser (unnamed and
fake controls, overlays, hover-only menus, closed shadow roots, canvas-only UIs, bot walls),
behavioural tasks with evidence-backed verdicts, and a safety review aimed at site owners.

> Lighthouse tells you whether agents can *read* your site. Agentic Web Check tells you whether
> they can *finish the job*, and whether it is *safe* to let them.

## Install

```sh
npx agentic-web-check scan https://example.com   # no install
npm i -g agentic-web-check                        # global: agentic-web-check and awc
```

Requirements: Node >= 20. Playwright needs a Chromium build; on first use run
`npx playwright install chromium`, or point the tool at an existing Chrome/Chromium with
`--browser-path` or `AWC_BROWSER_PATH`.

## CLI usage

```text
agentic-web-check scan   <url> [options]        deterministic scan, plus tasks when --tasks is given
agentic-web-check test   <url> [options]        tasks (default: built-in archetypes); checks still run
agentic-web-check ci     <url> [options]        scan with thresholds enforced, artifacts in --out (default ./awc-results)
agentic-web-check report <results.json>         re-render as terminal, --html, --md or --badge
agentic-web-check checks                        list every check with dimension, weight and title
awc                                             alias for agentic-web-check
```

Options shared by `scan`, `test` and `ci`:

| Option | Default | Meaning |
|---|---|---|
| `-p, --pages <n>` | 3 | same-origin pages to scan (start page + linked pages discovered from it) |
| `-t, --timeout <ms>` | 30000 | navigation timeout |
| `--tasks <spec>` | none | `default` for the built-in archetypes or a path to a tasks YAML file |
| `--agent <kind>` | baseline | `baseline` (no LLM) or `llm` |
| `--provider <name>` | openai | `openai` (any OpenAI-compatible endpoint) or `anthropic` |
| `--model <id>` | | LLM model id (or `AWC_LLM_MODEL`) |
| `--max-steps <n>` | 15 | default step budget per task for the `llm` agent; a task's `max_steps` overrides it |
| `--allow-forms` | off | let `safety: form-submit` tasks submit POST forms with synthetic data |
| `--allow-consequential` | off | let `safety: consequential` tasks perform consequential actions (sites you own only) |
| `--json`, `--html`, `--md`, `--badge <file>` | | write one artifact |
| `-o, --out <dir>` | | write `results.json`, `report.html`, `summary.md`, `badge.svg` and `screenshots/` |
| `--browser-path <path>` | | Chromium/Chrome executable (or `AWC_BROWSER_PATH`) |
| `--headed` | off | visible browser window |
| `--insecure` | off | accept invalid TLS certificates (staging hosts, corporate proxies; or `AWC_INSECURE=1`) |
| `-q, --quiet`, `-v, --verbose`, `--no-color` | | output control |

Threshold options (`scan` and `ci`; `test` has `--fail-on-task-fail` only): `--fail-under <score>`,
`--fail-on-task-fail` (exit 1 on any FAIL or BLOCKED task), `--fail-on <ids>` (comma-separated check
ids; append `:warn` to a check id to fail on warnings too).

Exit codes: `0` thresholds met, `1` a threshold was not met, `2` runtime error (unreachable URL,
browser failure, invalid tasks file).

## Behavioural testing

Two agent backends share one tool surface (snapshot, click, type, select, press, navigate, scroll,
back, finish). Every tool call is recorded.

- **baseline** (default, no API key). Deterministic: reads the accessibility snapshot, follows the
  control whose accessible name best matches the task's keywords and hints, types `data.query`
  into a search box when one exists, dismisses one overlay if it has a named dismiss button,
  stops when the success assertions hold. It is the weakest reasonable agent: when it passes, the
  site is unambiguously navigable; when it fails, the step log shows which perception gap stopped it.
- **llm** (`--agent llm`). Tool-calling loop over plain `fetch` against an OpenAI-compatible
  `chat/completions` endpoint or the Anthropic Messages API. Configure with `AWC_LLM_PROVIDER`
  (`openai` | `anthropic`), `AWC_LLM_MODEL`, `AWC_LLM_API_KEY` (falls back to `OPENAI_API_KEY` or
  `ANTHROPIC_API_KEY`) and `AWC_LLM_BASE_URL`. Local models work through any OpenAI-compatible
  server, for example Ollama: `AWC_LLM_BASE_URL=http://localhost:11434/v1 AWC_LLM_MODEL=<model>`.

A tasks file is a `tasks:` list. Three tasks:

```yaml
tasks:
  - name: contact-email
    goal: Find the email address for contacting the company.
    safety: read-only
    hints: [contact, support]
    success:
      - url: { regex: "contact|support" }
      - text: { includes: "@" }

  - name: search-product
    goal: Use the site search to find the trail bike and open its product page.
    data: { query: trail }
    success:
      - url: { includes: "/products/" }
      - title: { includes: "Trail" }

  - name: newsletter-signup
    goal: Subscribe the given email address to the newsletter.
    safety: form-submit            # needs --allow-forms to submit a POST form
    data: { email: awc-test@example.com }
    max_steps: 10
    success:
      - any_of:
          - text: { includes: "thanks for subscribing" }
          - element: { role: heading, name: "Subscribed" }
```

Assertions: `url` (`includes` | `equals` | `regex`), `text { includes }`, `title { includes }`,
`element { role, name?, state? }` (`state`: `checked` | `disabled`), `answer { must_include |
exact_match }` against the agent's returned answer, `navigated: true` (final URL differs from the
start URL), and `any_of [...]`. Text matching is case-insensitive with normalised whitespace and
accents. All assertions must hold unless wrapped in `any_of`. Full reference:
[docs/BEHAVIOURAL-TESTING.md](docs/BEHAVIOURAL-TESTING.md).

Safety classes: `read-only` (default; submitting a non-GET form or clicking a control with a
consequential name turns the task BLOCKED), `form-submit` (POST forms allowed with
`--allow-forms`, synthetic data only), `consequential` (purchase, delete, send, account changes;
allowed only with `--allow-consequential`). Nothing in the tool fills real personal data: it only
types what the task's `data` provides.

Evidence kept per task: ordered steps (tool, arguments, result, duration, URL, truncated snapshot
before the action, whether the page changed), screenshots at start and at the end or on failure
(when `--out` is set), final URL and title, assertion results, blocker kind, console errors, and
token usage for the `llm` agent.

## Scoring

Each check is `pass` (1), `warn` (0.5) or `fail` (0) with a weight of 10, 7, 3 or 1 by impact;
these are the weights Lighthouse derives from axe-core impact levels. A dimension score is the
weighted pass ratio of its checks; `na` and `info` checks are excluded. Overall is the weighted
mean of the dimensions.

| Dimension | Question | Weight (no tasks) | Weight (with tasks) |
|---|---|---|---|
| PERCEPTION | Does the accessibility tree describe the page truthfully and completely? | 20 | 14 |
| NAVIGATION | Can an agent find where things are? | 15 | 10.5 |
| INTERACTION | Can an agent operate the controls? | 20 | 14 |
| MACHINE INTERFACES | Are machine-readable entry points published? | 10 | 7 |
| RELIABILITY | Does the page reach a stable, accessible state for an automated browser? | 15 | 10.5 |
| SAFETY | Does the site give an agent what it needs to act safely? | 20 | 14 |
| TASK SUCCESS | Did real tasks complete, verified programmatically? | not scored | 30 |

No single number hides failures: the report always lists every failed and warned check with its
weight, the mode that produced the score (deterministic scan or behavioural verification), and the
methodology version. Every number can be recomputed from `results.json`. `page-load` is a gate: when
the start page does not load, every other check except `challenge-or-bot-wall` is `na` and the
overall is 0. The full check catalogue, detection rules and thresholds are in
[docs/SCORING.md](docs/SCORING.md).

## Output formats

Terminal (default), `--json` (stable, versioned `ScanResult` schema), `--html` (single
self-contained file, no external requests), `--md` (the summary used for GitHub job summaries and
PR comments), `--badge` (SVG), or `--out <dir>` for all of them plus screenshots. `report` re-renders
an existing `results.json` without rescanning.

## GitHub Action

```yaml
- uses: ericovirgy/agentic-web-check/action@v1
  with:
    url: https://preview.example.com
    tasks: default
    fail-under: 70
    fail-on-task-fail: true
```

Composite action: runs the CLI on the runner, writes a job summary, posts a sticky PR comment,
uploads the report as an artifact. Inputs, outputs and permissions: [action/README.md](action/README.md).

## Badge

`--badge badge.svg` writes a shields-style badge whose wording reflects exactly what was tested:

- `Agent Ready · scan` with `84/100 · v1` after a deterministic scan;
- `Agent Ready · verified (3 tasks)` with `84/100 · v1` after behavioural tasks were run.

`v1` is the methodology version. The badge never says "safe"; the SAFETY dimension is one input
among seven. Results are only comparable within the same methodology version.

## Security and privacy model

- No telemetry. The only network destinations are the target site and, with `--agent llm`, the
  LLM provider you configured. Chromium is launched with background networking disabled.
- Honest user agent: the default Chromium UA plus `AgenticWebCheck/<version>`. Plain HTTP probes
  (`/robots.txt`, `/sitemap.xml`, `/llms.txt`, `/.well-known/agent-card.json`, `/.well-known/ucp`,
  `/ai-catalog.json`, the raw HTML of the page) use the same UA.
- No credential testing, no authentication bypass, no CAPTCHA solving.
- Consequential links (delete, pay, unsubscribe, ...) are never followed while discovering pages.
  Tasks never submit non-GET forms or click consequential controls unless you opt in with
  `--allow-forms` / `--allow-consequential`, and then only with the synthetic data in the task file.
- Secret-looking tokens found in page source are reported with their values redacted.
- The SAFETY score is not an application security assessment. It answers whether the site gives an
  agent what it needs to act safely (confirmation steps, labelled boundaries, no hidden
  instructions). See [docs/SECURITY-MODEL.md](docs/SECURITY-MODEL.md) for the threat model of running
  the scanner and [SECURITY.md](SECURITY.md) for reporting vulnerabilities in the tool.

## Limitations

- One browser: headless Chromium via Playwright. No Firefox or WebKit.
- One start page plus up to `--pages - 1` linked same-origin pages. This is not a whole-site
  crawl, and page discovery does not currently consult robots.txt `Disallow` rules (the
  `robots-agent-access` check reads robots.txt; the crawler does not yet obey it).
- The checks are heuristics. Thresholds marked INFERENCE in [docs/SCORING.md](docs/SCORING.md)
  (snapshot size, server-rendered text ratio, overlay coverage, hover-menu detection) are
  defensible defaults, not validated constants.
- The baseline agent is a floor, not a vendor agent. Passing it says the site is easy; failing it
  says what a name-matching agent could not see. It says nothing about a specific product.
- LLM-driven results are non-deterministic. Run several times before drawing conclusions.
- `llms-txt` and `webmcp` checks reflect publication, not whether any agent uses them.
- WebMCP detection relies on an injected `registerTool` stub on `document.modelContext` /
  `navigator.modelContext` and on `form[toolname]`; pages that feature-detect differently are missed.
- Hidden-instruction detection is pattern-based and English-centric.
- No CAPTCHA solving: a challenge is reported, not bypassed.
- The public benchmark dataset has not been executed; no real-site numbers exist yet.

## Benchmark

`benchmark/run.ts` runs the scanner over a dataset and records raw results, an aggregate, a
summary and a manifest (dataset version, tool version, methodology version, browser, commit). The
`dev-fixtures` dataset (the eight local fixture sites) is the regression suite and runs offline.
`public-sample` is a candidate list of twelve public sites that tolerate automated access; it has
not been executed, and no numbers are claimed for it. Rules for running and publishing results:
[benchmark/README.md](benchmark/README.md).

## Roadmap

In rough order, none of it scheduled:
- execute and publish the public benchmark run;
- more task archetypes (pricing/product, docs lookup, add-to-cart to the last safe step);
- an optional Lighthouse adapter attaching the `agentic-browsing` audits to the report;
- robots.txt-aware page discovery;
- Firefox and WebKit;
- an MCP server exposing the scanner;
- hosted report sharing, only if there is demand.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the dev setup, the admission rule for new checks, and
how fixtures and task archetypes are added. Bugs and false positives have issue templates.

## License

[MIT](LICENSE).
