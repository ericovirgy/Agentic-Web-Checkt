# Agentic Web Check: product specification

Status: v0.1 (2026-10-04). This document is the contract the implementation is built against.
Every statement is labelled FACT (verified, see `docs/research/`), INFERENCE, DESIGN DECISION or UNVERIFIED.

## 1. The question

> Can an AI agent reliably understand and use this website, and is it safe to let it?

## 2. What the research changed

The original brief assumed "Lighthouse for AI agents" was an open slot. It is not:

- FACT: Lighthouse 13.2+ ships an official **Agentic Browsing** category (7 audits: `agent-accessibility-tree`,
  `llms-txt`, `ard-schema`, three WebMCP audits, CLS). It deliberately has no 0-100 score
  (`categoryScoreDisplayMode: 'fraction'`). See `research/01-lighthouse-chrome-agents.md`.
- FACT: Cloudflare (isitagentready.com), Vercel (is-agentic.com) and 15+ open-source tools already ship
  checklist-style "agent readiness" scanners with scores, GitHub Actions, badges and MCP servers.
  Almost all of them are **static** (cheerio/jsdom/BeautifulSoup); none runs the page in a browser the way
  an agent does. See `research/03-competitive-matrix.md`.
- FACT: Nobody open-source executes **real tasks** against a site with a browser and reports an
  evidence-backed verdict; the one product that does (ora/ax) runs on a closed hosted API.
- FACT: Nobody offers a site-owner-facing **agent safety review** (hidden instructions, unguarded consequential
  actions, bot walls that hit agents but not humans).
- FACT: Agent benchmarks (WebArena, Online-Mind2Web, WebVoyager) report the dominant failure causes as
  navigation getting stuck, grounding on unnamed/ambiguous controls, overlays/consent/CAPTCHA/bot walls, and
  dynamic state. See `research/04-benchmarks-a11y-security.md`.

DESIGN DECISION: we do not build another checklist scanner and we do not re-implement Lighthouse's
audits. We build the layer the ecosystem lacks and make the deterministic layer *perception-level*
(what an accessibility-tree agent actually receives from a live browser), not document-level.

Positioning sentence:

> Lighthouse tells you whether agents can *read* your site. Agentic Web Check tells you whether they can
> *finish the job*, and whether it is *safe* to let them.

## 3. Three layers

### Layer A: perception audit (deterministic, live browser, no LLM, no API key)

Runs the page in headless Chromium through Playwright, takes the same accessibility snapshot that
Playwright MCP / Chrome DevTools MCP / agent-browser feed to agents (`page.ariaSnapshot({ mode: 'ai' })`,
FACT, tested in this environment), runs axe-core, and evaluates checks against the live DOM and the
snapshot. Checks are only admitted when they map to a documented agent failure mode, a WCAG success
criterion, a Lighthouse audit, or a specification. See `docs/SCORING.md` for the list.

The audit covers one or more pages: the start URL plus up to N same-origin pages linked from the start page
(default 3, `--pages`), preferring agent-relevant destinations, never following consequential links and
honouring robots.txt for the tool's user agent. Bot walls are detected by comparing the browser load with a
plain HTTP fetch carrying the tool's user agent (the `challenge-or-bot-wall` check).

### Layer B: task verification (behavioural, browser, optional LLM)

A task is a goal plus **programmatic success criteria**. Verdicts never come from "the agent said it
finished"; they come from assertions evaluated against the final browser state, WebArena-style
(`url`, `text`, `element`, `answer`). Verdicts:

| Verdict | Meaning |
|---|---|
| PASS | agent reported completion AND every success assertion holds |
| FAIL | agent reported completion but assertions do not hold, or gave up, or exhausted the step budget |
| BLOCKED | a blocker was detected (CAPTCHA, bot wall/403/429, login required, unresolvable consent overlay, consequential step reached without opt-in) |
| INCONCLUSIVE | runner error (navigation timeout, browser crash, LLM/provider error, no assertion could be evaluated) |

Two agent backends share the same tool surface (snapshot, click, type, select, press, navigate, scroll,
back, finish):

- `baseline`: deterministic, no LLM. Reads the accessibility snapshot and follows controls whose accessible
  name matches the task's keyword set (synonym lists per archetype), with a step budget and loop detection.
  It represents the *weakest reasonable agent*: if the baseline can finish, the site is unambiguously
  agent-friendly; if it cannot, the evidence explains which perception gap stopped it. It makes
  `agentic-web-check test` work with no API key.
- `llm`: provider-agnostic. OpenAI-compatible chat/completions (OpenAI, Ollama, OpenRouter, Groq, Gemini
  compatibility endpoint) and the Anthropic Messages API, over plain `fetch`, selected by
  `--provider` / `AWC_LLM_PROVIDER`, `AWC_LLM_MODEL`, `AWC_LLM_API_KEY`, `AWC_LLM_BASE_URL`.
  (DESIGN DECISION pending `research/06-browser-agent-internals.md`; rationale: two small adapters beat a
  multi-megabyte SDK dependency for a tool distributed via `npx`.)

Tasks come from a YAML file (`--tasks tasks.yaml`) or from the built-in archetype library
(`--tasks default`: contact, legal-policy, help-or-about). Archetypes carry synonym sets and generic success
criteria that hold on most sites (each requires at least one navigation); they are the basis of the benchmark.
Search and product archetypes are planned once the public benchmark shows which criteria generalise.

Safety classes: `read-only` (default), `form-submit` (synthetic data only, requires `--allow-forms`),
`consequential` (purchase, delete, send, account changes; requires `--allow-consequential`, intended only for
sites the user owns). Without the opt-in the runner stops at the consequential step and reports BLOCKED.
The runner never fills real personal data.

Every run retains evidence: ordered steps (tool, args, duration, result), accessibility snapshot before each
action (truncated), screenshots at start, on failure and at the end, final URL/title, console errors,
blocker detections, token/cost when an LLM is used, and the reason for the verdict.

### Layer C: safety and capability review (deterministic)

Answers "what could an agent discover and exercise here, and what would mislead it?":

- hidden-instruction surface: text invisible to humans but present in the DOM/aria tree (display:none,
  visibility:hidden, opacity:0, font-size:0, off-screen/clip, colour equal to background, aria-hidden text,
  HTML comments, zero-width characters) that contains imperative instruction patterns;
- consequential actions reachable from ordinary navigation (buttons/links/forms whose names match
  purchase/delete/send/transfer/cancel/grant vocabularies) and whether they are guarded (confirmation dialog
  or `type=submit` inside a form with explicit confirmation text);
- forms that submit on change / auto-submit, forms posting to another origin, forms over HTTP;
- WebMCP tools: presence, count, schema sanity, `readOnlyHint` / `consequentialHint` /
  `untrustedContentHint` annotations;
- authentication boundary: login forms are detectable and labelled, no credential inputs outside forms;
- navigation hazards: links/buttons that trigger downloads, open new windows, or leave the origin without
  saying so; cross-origin iframes hosting controls;
- exposure: secret-looking tokens in inline scripts/HTML (pattern-based, reported as INFO, never exfiltrated).

The SAFETY dimension score answers "does this site give an agent what it needs to act safely?" It is not an
application security assessment and the output says so.

## 4. Scoring

See `docs/SCORING.md`. Summary: seven dimensions, each the Lighthouse-style weighted pass ratio of its checks
(weights 1/3/7/10 by impact); overall is a weighted mean over available dimensions; TASK SUCCESS is reported
separately and only blended when tasks were run; the output always states which mode produced the score.

## 5. Interfaces

```
agentic-web-check scan   <url> [--pages N] [--tasks default|file] [--agent baseline|llm] [--out dir] [--json|--html|--md|--badge file] [--fail-under N]
agentic-web-check test   <url> [--tasks default|file] [--agent baseline|llm]   # tasks (default archetypes when omitted)
agentic-web-check report results.json [--html out.html]                        # re-render
agentic-web-check ci     <url> [...scan flags] --fail-under 70 --fail-on-task-fail
agentic-web-check checks                                                       # list the check catalogue
awc                                                                            # alias
```

Exit codes: 0 pass, 1 thresholds not met, 2 runtime error. Output: terminal (default), JSON (stable schema,
versioned), HTML (static, single file), GitHub job summary (in the action). SARIF is not produced:
findings are located by URL and selector, not by file, so SARIF's value is marginal (DESIGN DECISION).

## 6. Privacy and ethics

No telemetry. No network calls other than to the target site (and the LLM provider the user configured);
Chromium is launched with background networking disabled. No credential testing, no authentication bypass,
no destructive actions, synthetic form data only, honest user agent (the Chromium UA followed by
`AgenticWebCheck/<version>`), robots.txt respected for crawling additional pages, consequential links never
followed while crawling.

## 7. Architecture

Single npm package (`agentic-web-check`), ESM, TypeScript, Node >= 20, Playwright 1.63 (FACT: public
`ariaSnapshot({ mode: 'ai' })` + `aria-ref=` locators), axe-core via `@axe-core/playwright`. Internal
modules mirror the layers (`src/browser`, `src/checks`, `src/tasks`, `src/scoring`, `src/report`, `src/cli`).
A GitHub Action lives in `action/` and runs the CLI inside the runner (no hosted service). Fixtures are
static HTML sites in `fixtures/` served locally for tests and the development benchmark in `benchmark/`.
DESIGN DECISION: a monorepo was rejected for v0.1; it adds publishing complexity without a second consumer.

Lighthouse is not a dependency (FACT: 171 MB install). A `--lighthouse` adapter that runs
`onlyCategories: ['agentic-browsing']` over the same Chromium and attaches its audits as evidence is on the
roadmap, not in v0.1.

## 8. Out of scope for v0.1

Hosted reports, leaderboards, authenticated flows, CAPTCHA solving, multi-browser (Firefox/WebKit),
SARIF, an MCP server exposing the scanner, GEO/citation metrics, the Lighthouse adapter, search/product task
archetypes.
