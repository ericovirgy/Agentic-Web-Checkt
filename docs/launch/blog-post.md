# Measuring whether the web is usable by AI agents

*Draft for maintainer review. Target length 1200 to 1500 words. Every number below is traceable to a
file in the repository; the sources section at the end lists them.*

---

Browser agents are now a normal way to use a website. Playwright MCP, Chrome DevTools MCP, agent-browser and the agent modes shipping in browsers all do the same thing: load a page, read a text representation of it, pick a control, act, repeat. Site owners have started asking whether their sites work for these visitors. The tooling that answers them has mostly measured the wrong thing.

## Claimed readiness versus observed readiness

Our research for this project catalogued more than fifteen open-source "agent readiness" scanners, plus hosted ones from Cloudflare (isitagentready.com, 19 checks in five categories, graded as levels) and Vercel (is-agentic.com, a 0 to 100 score; the npm CLI retrieves the hosted report). Almost all of them are static: they fetch the HTML and parse it with cheerio, jsdom or BeautifulSoup, then check for robots.txt rules, a sitemap, llms.txt, JSON-LD, markdown content negotiation and manifest files. Lighthouse 13 added an official Agentic Browsing category with seven audits, run in real Chrome, and deliberately shows it as a fraction rather than a 0 to 100 score.

These tools measure *signals*: files and markup a site publishes to declare that it is ready. They do not measure *outcomes*: whether an agent that arrives at the page can finish a job. The two are not the same. A site can publish a perfect llms.txt and still greet every agent with a full-viewport consent overlay whose only close control is an unnamed `div`. Nothing in a static scan sees the overlay, because the overlay only exists in a rendered page.

The agent benchmarks tell us where agents actually fail, and it is rarely a missing file. WebVoyager's manual analysis of 300 failures attributes 44.4% to navigation getting stuck and 24.8% to visual grounding. Online-Mind2Web's error analysis puts 51% of failures under access and environment issues: loading failures, access restrictions, CAPTCHA. Halluminate's Web Bench reports agents above 70% on read tasks and at 46.6% on write tasks. In WebArena, GPT-4 labelled 54.9% of feasible tasks as impossible. (These figures come from the papers and vendor posts cited in docs/research/04-benchmarks-a11y-security.md; several were read through secondary sources and should be re-checked against the primary paper before you quote them further.) The pattern is consistent: agents fail on perception and interaction, on overlays and bot walls and ambiguous controls, not on discoverability metadata.

Agentic Web Check is built on that observation. It measures what the agent receives, and then checks whether an agent can finish.

## What agents actually perceive

A tree-based browser agent does not see pixels and does not see your HTML. It sees an accessibility snapshot: a YAML-like list of `role "name" [attributes]` nodes with reference ids it can act on.

```text
- navigation "Main":
  - link "Products" [ref=e12]
  - link "Pricing" [ref=e13]
- main:
  - heading "Northwind Bikes" [level=1]
  - button "Submit" [ref=e36] [cursor=pointer]
  - button "Submit" [ref=e40] [cursor=pointer]
  - generic [ref=e4] [cursor=pointer]: ×
```

Playwright exposes this as `page.ariaSnapshot({ mode: 'ai' })`, and that is what the bundled Playwright MCP server captures. Chrome DevTools MCP's `take_snapshot` and agent-browser produce the same shape from the same source, the browser's accessibility tree. Whatever vendor agent visits your site, this tree is the common denominator. If a control has no accessible name, the agent sees `button` with nothing to go on. If an element is a `div` with an `onclick` handler, it is not a control at all in this view; some harnesses fall back to `cursor:pointer` hints, most do not. If a menu only renders on hover, its links are absent.

So the website-side lever is the quality of this tree. That is also why the deterministic layer of Agentic Web Check works at perception level rather than document level: it runs the page in headless Chromium, takes the AI-mode snapshot, runs selected axe-core rules, and evaluates its checks against the snapshot and the live DOM.

## Three layers

**Perception audit.** 43 checks across six dimensions: PERCEPTION (does the tree describe the page truthfully?), NAVIGATION (can an agent find where things are?), INTERACTION (can it operate the controls?), MACHINE INTERFACES (are machine-readable entry points published?), RELIABILITY (does the page reach a stable state for an automated browser?) and SAFETY (does the site give an agent what it needs to act safely?). A check is admitted only when it maps to a WCAG success criterion, a Lighthouse audit, a specification, or a failure mode documented in an agent benchmark or harness. Examples: unnamed interactive nodes, generic elements with pointer cursors, duplicated link names pointing to different URLs, overlays covering the viewport without a named dismiss control, closed shadow roots containing controls, canvas-only interfaces, bot walls that answer the browser differently from a plain fetch.

**Task verification.** A task is a goal plus success criteria. An agent drives the browser through one tool surface (snapshot, click, type, select, press, navigate, scroll, back, finish). Two backends share it. The `baseline` agent is deterministic and needs no API key: it reads the snapshot and follows controls whose accessible names match the task's keywords, with a step budget and loop detection. It is the weakest reasonable agent, which makes it useful: if it finishes, the site is unambiguously navigable; if it fails, the step log shows which perception gap stopped it. The `llm` agent is a tool-calling loop over plain `fetch` against any OpenAI-compatible endpoint or the Anthropic Messages API, so local models through Ollama work without an SDK dependency.

**Safety review.** Hidden text that addresses AI systems (display:none, aria-hidden, HTML comments, zero-width characters, text matching the background), consequential buttons and forms (delete, buy, send, cancel) reachable without a confirmation signal, forms posting over HTTP or cross-origin, WebMCP tools without `consequentialHint` or `readOnlyHint`, login forms without a labelled boundary, secret-looking tokens in page source (reported redacted), downloads and new windows that are not announced. This is a review of what the site gives an agent to act safely; the output states that it is not an application security assessment.

## How verdicts are computed

Verdicts never come from the agent. They come from assertions evaluated against the final browser state, in the shape WebArena uses: URL matching, text inclusion, element presence by role and name, title, or an answer the agent returned, combined with `any_of` where a site may satisfy a goal in several ways.

```yaml
tasks:
  - name: contact-email
    goal: Find the email address for contacting the company.
    safety: read-only
    hints: [contact, support]
    success:
      - url: { regex: "contact|support" }
      - text: { includes: "@" }
```

PASS means the agent reported completion and every assertion holds. FAIL means it gave up, exhausted its budget, or claimed completion while the assertions do not hold. BLOCKED means the runner detected a CAPTCHA, a bot wall, a login requirement, a consent overlay with no named dismiss control, or a consequential step the task was not allowed to take. INCONCLUSIVE means a runner error. There is no LLM judge anywhere in the verdict path. The benchmark literature is clear about why: WebArena Verified found bespoke evaluators passing hallucinated answers, and agents are known to declare success after a modal or CAPTCHA actually blocked the submit.

## The scoring rationale

Each check is pass (1), warn (0.5) or fail (0) with a weight of 10, 7, 3 or 1. Those four weights are the ones Lighthouse derives from axe-core impact levels for its accessibility category; reusing them gives a documented scale rather than an invented one. A dimension score is the weighted pass ratio of its checks; checks that are not applicable or informational are excluded. The overall score is a weighted mean over dimensions: 20/15/20/10/15/20 without tasks, and with tasks the six dimensions shrink proportionally and TASK SUCCESS takes 30%, because observed behaviour outranks inferred behaviour.

Perception, interaction and safety carry the most weight because the benchmark error analyses attribute most failures to grounding, interaction and blocking, and because safety failures have real-world cost. Machine interfaces are weighted low on purpose. The evidence that agents consume llms.txt is thin: in an Ahrefs study of 137k domains' logs from June 2026, 28% published an llms.txt and 97% of those files received zero requests, and no major vendor documents consuming it. WebMCP is an origin trial. The `llms-txt` and `webmcp` checks therefore report publication, not use, and the report says so.

Every number is reproducible from `results.json`. The methodology version (currently 1) is embedded in every result and badge, and results are only comparable within one version.

## What we found

Eight fixture sites ship in the repository and double as the regression dataset. The `ambiguous-ui` fixture is a deliberately broken site: a full-viewport cookie overlay whose only close control is an unnamed `div`, three buttons named "Submit", hover-only menus, an unguarded "Delete account" button. It scores 58/100 with tasks. All three built-in tasks come back BLOCKED after zero steps, each with the same reason: `consent-overlay: div#consent covering 100% of the viewport with no named dismiss control`. That is the shape of result we want: a failing task tied to the concrete page defect that caused it, with a suggested fix.

```sh
npx agentic-web-check scan https://example.com --tasks default --out awc-results
```

We also ran one real-world scan, of https://pypi.org/ on 2026-10-04, as an illustration rather than a judgement; the site's maintainers were not contacted and a scan is a snapshot of one day. It scored 71/100 with the baseline agent: the help-or-about task passed in one step, the contact task failed because no control on the start page matched a contact-like name, and the legal-policy task failed after the agent looped. The perception and navigation findings are genuine observations of the rendered page: four navigation links per page flagged as hidden until hover, nine link names reused for different destinations, four elements with positive tabindex on the login page, and an 86,786-character accessibility snapshot on the help page, which is above the budget many agent harnesses tolerate before truncating. One finding is partly an artefact: the scan ran from a sandbox whose egress proxy blocked analytics scripts, so the console-errors failure counts failures that would not occur from a normal network. We left it in the example file because it is a good reminder that a scan reports the environment it ran in.

## What we deliberately do not do

We do not duplicate the checklist layer. Lighthouse's Agentic Browsing audits, Cloudflare's and Vercel's scanners and the open-source static tools cover robots, sitemap, llms.txt format, JSON-LD and WebMCP validity well; our machine-interfaces dimension carries a handful of those checks only because a report with a hole in it is confusing, and they are weighted low.

We do not run a hosted service. The CLI runs on your machine or your CI runner; the GitHub Action is a composite action that installs the CLI from npm and runs it there. The HTML report is a single file with no external requests.

We do not collect telemetry. The only network destinations are the target site and, with `--agent llm`, the provider you configured. The user agent is honest (`AgenticWebCheck/<version>`), tasks never submit non-GET forms or click consequential controls unless you opt in, and nothing fills real personal data.

## The benchmark plan, and a request

The gap the research identified most clearly is validation: nobody has shown that any static readiness score predicts agent task success. The benchmark harness in `benchmark/` exists to produce that evidence reproducibly: a dataset file, a fixed number of runs, raw results, an aggregate and a manifest recording tool version, methodology version, browser, commit and date. The `dev-fixtures` dataset has been run. The `public-sample` dataset, twelve public sites that tolerate automated access, has not. We will not quote a number for it until a run directory is committed, and the rules for publishing results are written down in `benchmark/README.md`.

Contributions that help most right now:

- **False positives.** Every check is a heuristic. The issue template asks for the check id, the evidence JSON and, ideally, a minimal HTML snippet, which becomes the fixture for the fix.
- **Task archetypes.** Three ship today. Pricing lookup, documentation search and add-to-cart to the last safe step are the obvious next ones; proposals need site-generic success criteria.
- **Local model reports.** Which models complete the fixture tasks through the `llm` agent, at what step count and token cost.
- **Benchmark runs.** Reproducible runs of `public-sample` with the manifest attached.

The repository is https://github.com/ericovirgy/agentic-web-check, MIT licensed, version 0.1.0.

---

## Sources (for the maintainer; remove or convert to links before publishing)

- Lighthouse Agentic Browsing category, seven audits, fraction display mode: docs/research/01-lighthouse-chrome-agents.md and docs/research/03-competitive-matrix.md (FACT, read from `core/config/default-config.js`).
- Cloudflare 19 checks, levels; Vercel hosted report and thin CLI; count of static scanners: docs/research/03-competitive-matrix.md (Cloudflare and Vercel details are FACT (secondary); the CLI behaviour is FACT from the npm README).
- Failure statistics (WebVoyager 44.4% / 24.8%, Online-Mind2Web 51%, Web Bench 70% / 46.6%, WebArena 54.9%): docs/research/04-benchmarks-a11y-security.md §A.3, tagged FACT\* (snippet-sourced; re-verify against the primary paper before quoting).
- `ariaSnapshot({ mode: 'ai' })` used by Playwright MCP; DevTools MCP `take_snapshot`: docs/research/01 (FACT) and docs/research/04 §B.2 (FACT).
- Weights 10/7/3/1 from Lighthouse's accessibility scoring: docs/SCORING.md §1; docs/research/04 §B.1 (FACT).
- Ahrefs llms.txt usage study: docs/research/02-webmcp-standards.md §3 (FACT-S).
- Fixture result 58/100 and BLOCKED reasons: docs/examples/terminal-output.txt.
- pypi.org scan: docs/examples/results-pypi-org.json (71/100, 3 pages, 2026-10-04T21:50:46Z, chromium 141).
- Check count, archetypes, limitations, privacy model: README.md, CHANGELOG.md, src/checks/*.ts, src/tasks/archetypes.ts.
