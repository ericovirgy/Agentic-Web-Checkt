# Measuring whether the web is usable by AI agents

*Draft for maintainer review. Target length 1200 to 1500 words. Every number below is traceable to a
file in the repository; the sources section at the end lists them.*

---

Browser agents are now a normal way to use a website: load a page, read a text representation of it, pick a control, act, repeat. Site owners have started asking whether their sites work for these visitors. Most of the tooling that answers them measures the wrong thing.

## Claimed readiness versus observed readiness

Our research catalogued more than fifteen open-source "agent readiness" scanners, plus hosted ones from Cloudflare (isitagentready.com, 19 checks in five categories, graded as levels) and Vercel (is-agentic.com, a 0 to 100 score; its npm CLI retrieves the hosted report). Almost all are static: fetch the HTML, parse it, check for robots.txt rules, a sitemap, llms.txt, JSON-LD and manifests. Lighthouse 13 added an official Agentic Browsing category with seven audits, run in real Chrome and deliberately shown as a fraction, not a score.

These tools measure signals: files and markup a site publishes to declare itself ready. They do not measure outcomes. A site can publish a perfect llms.txt and still greet every agent with a full-viewport consent overlay whose only close control is an unnamed `div`. A static scan never sees the overlay; it only exists in a rendered page.

The agent benchmarks say where agents actually fail, and it is rarely a missing file. WebVoyager's analysis of 300 failures attributes 44.4% to navigation getting stuck and 24.8% to visual grounding. Online-Mind2Web puts 51% of failures under access and environment issues: loading failures, access restrictions, CAPTCHA. Web Bench reports agents above 70% on read tasks and at 46.6% on write tasks. (Sources are in docs/research/04; several were read through secondary reports and should be re-checked against the primary paper before quoting.) The pattern is consistent: perception, interaction and blocking, not discoverability metadata.

Agentic Web Check measures what the agent receives, then checks whether an agent can finish.

## What agents actually perceive

A tree-based browser agent sees neither pixels nor HTML. It sees an accessibility snapshot: a list of `role "name" [attributes]` nodes with reference ids it can act on.

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

Playwright exposes this as `page.ariaSnapshot({ mode: 'ai' })`, and that is what the bundled Playwright MCP server captures. Chrome DevTools MCP's `take_snapshot` and agent-browser produce the same shape from the same source, the browser's accessibility tree. Whichever agent visits your site, this tree is the common denominator. A control with no accessible name is a bare `button`. A `div` with an `onclick` handler is not a control at all. A menu that renders on hover is absent.

So the website-side lever is the quality of this tree, and the deterministic layer of Agentic Web Check works there: headless Chromium, the AI-mode snapshot, selected axe-core rules, checks evaluated against the snapshot and the live DOM.

## Three layers

**Perception audit.** 43 checks across six dimensions: PERCEPTION, NAVIGATION, INTERACTION, MACHINE INTERFACES, RELIABILITY and SAFETY. A check is admitted only when it maps to a WCAG success criterion, a Lighthouse audit, a specification, or a failure mode documented in an agent benchmark or harness. Examples: unnamed interactive nodes, generic elements with pointer cursors, duplicated link names with different targets, blocking overlays without a named dismiss control, closed shadow roots, bot walls.

**Task verification.** A task is a goal plus success criteria. An agent drives the browser through one tool surface (snapshot, click, type, select, press, navigate, scroll, back, finish). The `baseline` agent is deterministic and needs no API key: it follows controls whose names match the task's keywords, with a step budget and loop detection. It is the weakest reasonable agent, which is the point: if it finishes, the site is unambiguously navigable; if it fails, the step log shows which perception gap stopped it. The `llm` agent is a tool-calling loop over plain `fetch` against any OpenAI-compatible endpoint or the Anthropic Messages API, so local models through Ollama work without an SDK dependency.

**Safety review.** Hidden text addressed to AI systems (display:none, aria-hidden, HTML comments, zero-width characters), consequential buttons and forms (delete, buy, send, cancel) reachable without a confirmation signal, forms posting over HTTP or cross-origin, WebMCP tools without safety annotations, unlabelled login boundaries, secret-looking tokens (redacted). The output states that this is not an application security assessment.

## How verdicts are computed

Verdicts never come from the agent. They come from assertions evaluated against the final browser state, in the shape WebArena uses: URL, text inclusion, element presence by role and name, title, or an answer the agent returned, with `any_of` where a goal can be satisfied several ways.

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

PASS: the agent reported completion and every assertion holds. FAIL: it gave up, exhausted its budget, or claimed completion while assertions do not hold. BLOCKED: a CAPTCHA, bot wall, login requirement, consent overlay with no named dismiss control, or a consequential step the task was not allowed to take. INCONCLUSIVE: a runner error. There is no LLM judge in the verdict path: WebArena Verified found bespoke evaluators passing hallucinated answers, and agents are documented declaring success after a modal or CAPTCHA blocked the submit.

## The scoring rationale

Each check is pass (1), warn (0.5) or fail (0) with a weight of 10, 7, 3 or 1, the weights Lighthouse derives from axe-core impact levels for its accessibility category: a documented scale rather than an invented one. A dimension score is the weighted pass ratio of its checks; the overall is a weighted mean over dimensions, 20/15/20/10/15/20 without tasks. With tasks, TASK SUCCESS takes 30% and the rest shrink proportionally, because observed behaviour outranks inferred behaviour.

Perception, interaction and safety carry the most weight because the benchmark error analyses attribute most failures to grounding, interaction and blocking, and because safety failures have real-world cost. Machine interfaces are weighted low on purpose: in an Ahrefs study of 137k domains' logs (June 2026), 28% published an llms.txt and 97% of those files received zero requests, and no major vendor documents consuming it; WebMCP is an origin trial. The `llms-txt` and `webmcp` checks therefore report publication, not use.

Every number is reproducible from `results.json`. The methodology version (currently 1) is embedded in every result and badge; results are only comparable within one version.

## What we found

Eight fixture sites ship in the repository and double as the regression dataset. `ambiguous-ui` is deliberately broken: a full-viewport cookie overlay whose only close control is an unnamed `div`, three buttons named "Submit", hover-only menus, an unguarded "Delete account" button. It scores 58/100, and all three built-in tasks come back BLOCKED after zero steps with the same reason: `consent-overlay: div#consent covering 100% of the viewport with no named dismiss control`. That is the result shape we want: a failed task tied to the defect that caused it, with a fix.

```sh
npx agentic-web-check scan https://example.com --tasks default --out awc-results
```

We also ran one real-world scan, of https://pypi.org/ on 2026-10-04, as an illustration rather than a judgement; the site's maintainers were not contacted and a scan is a snapshot of one day. It scored 71/100 with the baseline agent: help-or-about passed in one step, contact failed because no start-page control matched a contact-like name, legal-policy failed after the agent looped. The perception and navigation findings are genuine observations of the rendered page: four navigation links per page flagged as hidden until hover, nine link names reused for different destinations, four elements with positive tabindex on the login page, and an 86,786-character snapshot on the help page. One finding is partly an artefact: the scan ran from a sandbox whose egress proxy blocked analytics scripts, so the console-errors failure counts errors a normal network would not produce. A scan reports the environment it ran in.

## What we deliberately do not do

We do not duplicate the checklist layer. Lighthouse's Agentic Browsing audits, the Cloudflare and Vercel scanners and the open-source static tools cover robots, sitemap, llms.txt format, JSON-LD and WebMCP validity; our machine-interfaces dimension carries a few of those checks so the report has no hole, and weights them low.

We do not run a hosted service. The CLI runs on your machine or your CI runner; the GitHub Action installs the CLI from npm and runs it there. The HTML report is one file with no external requests.

We do not collect telemetry. The only network destinations are the target site and, with `--agent llm`, the provider you configured. The user agent is honest, tasks never submit non-GET forms or click consequential controls unless you opt in, and nothing fills real personal data.

## The benchmark plan, and a request

The clearest gap in the research is validation: nobody has shown that any static readiness score predicts agent task success. The harness in `benchmark/` exists to produce that evidence reproducibly: a dataset file, a fixed number of runs, raw results, an aggregate and a manifest recording tool version, methodology version, browser, commit and date. The `dev-fixtures` dataset has been run. The `public-sample` dataset, twelve public sites that tolerate automated access, has not, and we will not quote a number for it until a run directory is committed.

Contributions that help most now: false-positive reports (the issue template asks for the check id, the evidence JSON and a minimal HTML snippet, which becomes the fixture for the fix); task archetypes beyond the three that ship today (pricing lookup, documentation search, add-to-cart to the last safe step), with site-generic success criteria; reports of which local models complete the fixture tasks through the `llm` agent, at what step count and token cost; and reproducible runs of `public-sample` with the manifest attached.

The repository is https://github.com/ericovirgy/agentic-web-check, MIT licensed, version 0.1.0.

---

## Sources (for the maintainer; remove or convert to links before publishing)

- Lighthouse Agentic Browsing category, seven audits, fraction display mode: docs/research/01-lighthouse-chrome-agents.md and docs/research/03-competitive-matrix.md (FACT, read from `core/config/default-config.js`).
- Cloudflare 19 checks and levels; Vercel hosted report and thin CLI; count of static scanners: docs/research/03-competitive-matrix.md (Cloudflare and Vercel spec details are FACT (secondary); the CLI behaviour is FACT from the npm README).
- Failure statistics (WebVoyager 44.4% / 24.8%, Online-Mind2Web 51%, Web Bench 70% / 46.6%): docs/research/04-benchmarks-a11y-security.md §A.3, tagged FACT\* (snippet-sourced; re-verify against the primary paper before quoting). WebArena Verified finding: §A.1, FACT\*.
- `ariaSnapshot({ mode: 'ai' })` used by Playwright MCP; DevTools MCP `take_snapshot`: docs/research/01 (FACT) and docs/research/04 §B.2 (FACT).
- Weights 10/7/3/1 from Lighthouse's accessibility scoring: docs/SCORING.md §1; docs/research/04 §B.1 (FACT).
- Ahrefs llms.txt usage study: docs/research/02-webmcp-standards.md §3 (FACT-S).
- Fixture result 58/100 and BLOCKED reasons: docs/examples/terminal-output.txt.
- pypi.org scan: docs/examples/results-pypi-org.json (71/100, 3 pages, 2026-10-04T21:50:46Z, chromium 141). Not yet committed at the time of drafting; see launch-checklist.md step 0.
- Check count, archetypes, limitations, privacy model: README.md, CHANGELOG.md, src/checks/*.ts, src/tasks/archetypes.ts.
