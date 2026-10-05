# Descriptions

Curator one-liner: Open-source browser evaluator for whether AI agents can actually use websites.

Short (under 140 characters): A local CLI that runs checks and real tasks in headless Chromium to show where an AI agent gets stuck on your website.

## 50 words

Agentic Web Check is an open-source command-line tool that tests whether an AI agent can use your website. It loads the site in headless Chromium, runs 43 deterministic checks, tries read-only tasks, and decides each verdict from assertions on the final page. No API key needed for the default mode. MIT.

## 100 words

Agentic Web Check is an MIT-licensed command-line tool that answers one question: can an AI agent actually use this website? It loads the site in headless Chromium, reads the accessibility snapshot an agent would see, and runs 43 deterministic checks. It can then run read-only tasks, such as finding contact details or a privacy policy, and decides each verdict (PASS, FAIL, BLOCKED, INCONCLUSIVE) from assertions on the final browser state, never from the agent's own claim. A safety review flags hidden instructions for AI systems and unguarded buy or delete buttons. The default mode needs no API key and the tool sends no telemetry.

## 250 words

Agentic Web Check is an open-source command-line tool for site owners and developers who want to know whether an AI agent can actually use a website, and what stops it when it cannot.

It loads the site in headless Chromium through Playwright and takes the AI-mode accessibility snapshot, the representation Playwright's MCP server gives a model. It runs 43 deterministic checks across six dimensions: perception, navigation, interaction, machine interfaces, reliability and safety.

Optionally it runs tasks. A task is a goal plus programmatic success assertions, for example "find the page describing the privacy policy". A built-in baseline agent needs no API key; an LLM agent can be used through any OpenAI-compatible endpoint or the Anthropic API. The verdict (PASS, FAIL, BLOCKED or INCONCLUSIVE) is computed from the final browser state, and every step is recorded.

A separate safety review looks for hidden text addressed to AI systems, consequential actions such as delete or buy without a confirmation step, forms posting over HTTP, WebMCP tools without safety annotations, and secret-looking values in page source.

Output is a terminal report, JSON, a self-contained HTML file, Markdown for pull requests, and an SVG badge. An experimental GitHub Action wraps the CLI. The tool sends no telemetry, respects robots.txt for page discovery and never submits forms or performs consequential actions unless you opt in.

Version 0.1.0 is early. Chromium only, a few pages per scan rather than a crawl, and some thresholds are documented defaults rather than validated constants. A public benchmark is planned and has not been run.

## Technical (developer)

`npx agentic-web-check scan <url> --tasks default` launches headless Chromium, captures
`page.ariaSnapshot({ mode: 'ai' })`, runs selected axe-core rules and 43 checks against the live
DOM and snapshot, then drives a tool-calling agent (snapshot, click, type, select, press, navigate,
scroll, back, finish) through YAML-defined tasks. Success is a list of assertions (`url`, `text`,
`title`, `element`, `answer`, `navigated`, `any_of`) evaluated against the final browser state.
Safety classes (`read-only`, `form-submit`, `consequential`) gate side effects behind
`--allow-forms` and `--allow-consequential`. `ci` mode enforces `--fail-under`, `--fail-on-task-fail`
and `--fail-on <ids>`, with exit codes 0, 1 and 2. Results are a versioned JSON schema. Local models work
through any OpenAI-compatible server.

## Website owner

Before a customer's AI agent visits your site, run this on it. You get a score, a list of the exact
elements that confuse an agent (unnamed buttons, cookie walls without a close button, menus that
only open on hover, delete buttons with no confirmation), and a pass or fail on simple tasks such
as finding your contact details. It runs on your own computer and your pages are not sent anywhere.
It is a diagnostic for one start page and a few linked pages, not a certification.

## Researcher and media

Agentic Web Check separates two things that static agent-readiness scanners tend to bundle: whether
a site describes itself well to machines, and whether an agent can finish a task on it. The first
is measured with deterministic checks on the browser's accessibility representation. The second is
measured by running scripted tasks with programmatic success criteria. Version 0.1.0 includes a
validation run on 16 public sites with a baseline agent, explicitly not a benchmark; a public
benchmark with a frozen methodology is planned and has not been executed. No claim is made that
static signals do or do not predict task completion. The question is open and testable.
