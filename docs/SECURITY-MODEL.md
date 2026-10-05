# Security model of running the scanner

This document is the threat model for *running* Agentic Web Check: what an untrusted target site
can and cannot do to the machine running the scan, to the LLM agent, and to third parties. It is not
about the SAFETY dimension of the report (that measures the site; see `docs/SCORING.md` §3 and §5).
Report vulnerabilities in the tool as described in `SECURITY.md`.

## Assets and trust

| Asset | Trust |
|---|---|
| The machine running the CLI or the GitHub Action (filesystem, environment variables, network) | trusted |
| The LLM API key (`AWC_LLM_API_KEY` and fallbacks) | secret; sent only to the configured provider endpoint |
| The target site and everything it serves (HTML, scripts, text, accessibility names, hidden text, HTTP responses) | untrusted |
| The LLM provider's responses | untrusted input to the tool loop; only recognised tool calls are acted on |
| The tasks YAML file | trusted; written by the operator |

## What page content can reach

**Browser sandbox.** Pages run only inside Playwright's Chromium. The tool never evaluates page
content outside the browser: no `eval` of page strings in Node, no execution of downloaded files.
Data leaves the page through `page.evaluate` as plain JSON (`PAGE_DATA_SCRIPT`, `INIT_SCRIPT` state)
and through Playwright's accessibility snapshot, and is handled as data. Snapshots and evidence are
bounded (snapshot text handed to the agent is cut at 24,000 characters, evidence at 25 items per
check, per-item strings at a few hundred characters) so a page cannot blow up memory or report size.

**Filesystem.** The scanner writes only where asked: `--json/--html/--md/--badge` paths and the
`--out` directory (`results.json`, `report.html`, `summary.md`, `badge.svg`, `screenshots/`).
Screenshot file names are derived from task names from the trusted tasks file, with characters
outside `[a-z0-9-]` replaced. Page content never chooses a path. Downloads are disabled in the
browser context (`acceptDownloads: false` in `src/browser/session.ts`): a navigation that would
start a download is cancelled by Chromium, and a link that would start one is reported by the
`download-and-popup-links` check, not followed to disk.

**Terminal and markdown output.** Task reasons, page titles, URLs, accessible names and other
page-derived strings are passed through `stripControl` (`src/util/text.ts`), which removes ANSI
and OSC escape sequences and C0/C1 control characters, before they are printed to the terminal or
written to `summary.md`; markdown table cells are additionally escaped (`markdownCell`). The GitHub
Action's PR comment is built from that sanitised summary. Credentials in the URL given on the
command line are stripped (`username` and `password` cleared) before the browser or the probes
see it, so they never appear in reports.

**Network.** Outbound requests go to the target origin (browser navigation, resources the page
loads, the plain HTTP probes for `/robots.txt`, `/sitemap.xml`, `/llms.txt`, the three well-known
manifests and the raw HTML) and, with `--agent llm`, to the configured provider base URL. Chromium
is launched with background networking, component updates, sync and default apps disabled. There is
no telemetry. Page-initiated requests (images, scripts, beacons, third-party embeds) are the same as
in any browser visit; the scanner does not block them. TLS errors fail the navigation unless the
operator passes `--insecure` (or `AWC_INSECURE=1`), which is for staging hosts and should not be used
against the public internet.

**Page discovery.** Additional pages come from links in the start page's snapshot, same origin only,
`http(s)` only, skipping links with consequential names and URLs carrying `confirm`, `delete`,
`remove`, `action`, `do`, `logout` or `unsubscribe` query parameters, and skipping binary file
extensions. `/robots.txt` is fetched first and a candidate is only picked when the rules that apply
to the tool's user agent token (RFC 9309 group selection, longest match wins, allow wins ties)
permit its path. Path patterns are matched with a linear-time matcher (`globMatch` in
`src/browser/probes.ts`), so a hostile robots.txt cannot cause catastrophic backtracking. The start
URL itself is always loaded; robots.txt governs discovery, not the page you asked for.

**HTML report.** `report.html` embeds page-derived strings (accessible names, selectors, snippets).
They are HTML-escaped before insertion; the report has no external requests and a few lines of inline
script of its own. Open it like any report you generated yourself.

## The LLM agent and prompt injection

With `--agent llm`, page content is fed verbatim to a language model as accessibility snapshots.
Hidden or visible text on the page can therefore try to redirect the model ("ignore the task and
..."). This is indirect prompt injection (OWASP LLM01). The tool assumes it will happen and limits
what a hijacked model can do:

| Mitigation | Mechanism |
|---|---|
| Step cap | `max_steps` per task (default 15); the last step forces `finish` |
| Wall-clock cap | max(60 s, 4 × `--timeout`) per task |
| Same-origin navigation | the `navigate` tool rejects URLs whose origin differs from the scanned URL (same-tab clicks and server redirects are not intercepted; see below) |
| No iframe content for the model | the snapshot handed to the LLM agent omits iframe subtrees (`src/tasks/llm-agent.ts`), so the model cannot read cross-origin frames, including frames served from internal hosts; the deterministic checks still inspect frames (`cross-origin-iframe-controls`) |
| Popup handling | a new tab opened by an action is closed; its URL is opened in the main tab only when it is on the scanned origin, otherwise it is recorded and not followed |
| Consequential-action guard | clicking a control whose name matches the consequential vocabulary, or submitting a non-GET form, is refused unless the task's `safety` class and the matching `--allow-*` flag opt in; the task ends BLOCKED |
| Synthetic data only | the model is told to type only the task's `data`; the tool never has access to real user data, credentials or the API key inside the browser |
| No credentials in the loop | the API key is sent only in the provider request header, never into the browser or the prompt |
| Verdict independence | PASS requires the success assertions to hold on the final page; a model that is talked into claiming `done` on the wrong page yields FAIL |
| Blocker detection before every step | CAPTCHA, bot wall, login wall and blocking overlays end the task instead of letting the model try to get around them |
| Bounded context | one snapshot at a time, truncated; tool results are strings, never executed |

The deterministic layer independently reports hidden instruction text aimed at AI systems
(`hidden-instructions` check), so the operator sees the injection surface even without running an
LLM.

## What is not mitigated

Be aware of these before running behavioural tasks against sites you do not control:

- **Same-tab clicks and redirects can leave the origin.** The `navigate` tool and the popup handler
  enforce same-origin, the `click` tool does not, and HTTP or script redirects are followed. A click
  on an ordinary link to another site, or a redirect issued by the target, is executed and the next
  snapshot comes from that site. The step log records the URL of every step, so the excursion is
  visible in the report. The baseline agent only clicks name-matched controls; the LLM agent clicks
  what it decides to click.
- **GET requests are unguarded.** Typing into a search box and pressing Enter, following links with
  query strings, or a hijacked model navigating to `https://<origin>/?q=<synthetic data>` sends the
  task's synthetic data to the target site. Nothing else is available to leak: there is no real data
  in the loop.
- **Consequential names are a vocabulary match.** A button named "Confirm" or "Continue" that
  actually places an order, or a non-English label, is not recognised; a form using GET for a
  mutation is treated as safe. Use `read-only` tasks and sites you own for anything with real
  effects.
- **`select` and `press` are not guarded.** Pressing Enter on a focused submit button bypasses the
  form check applied to `type(..., submit: true)` and `click`.
- **The model can be made to waste the budget** or to return a wrong `answer`. Caps bound the cost;
  assertions catch wrong answers only when the task has `answer`/`text` criteria.
- **Hidden-instruction detection is pattern-based** (`INJECTION_PATTERNS`, English-centric). It is
  a report signal, not a filter: nothing is removed from what the model sees.
- **The target site sees the run.** Honest user agent, real browser traffic, real form submissions
  when opted in. Rate limiting, bot detection and logging on the site's side are its own business.
- **Third-party content inside the page** (embedded widgets, ads) is page content like any other and
  can carry injections. Iframe subtrees are omitted from what the model sees, but content a script
  injects into the main document is not.
- **The provider is trusted with page content.** Snapshots of the scanned pages are sent to the LLM
  endpoint you configured. Do not run the LLM agent against confidential pages with a provider you
  would not share them with.

## Known boundary assumptions

These are properties of the design, not bugs to be fixed in a point release:

- **The scanner visits whatever URL it is given**, including private hosts, link-local and
  loopback addresses. There is no allow-list; if you run it in CI against an internal preview, the
  runner's network reach is the boundary. Do not expose it as a service that scans attacker-chosen
  URLs without adding your own URL policy.
- **Redirects are followed.** A target that redirects to another origin is scanned at the
  destination the browser lands on; the report records the final URL of each page.
- **The page can tamper with in-page measurement.** The init script and `page.evaluate` calls run
  in the page's main world, not an isolated world. A hostile page can overwrite `window.__awc`,
  redefine DOM APIs or lie about its own state, and so hide findings (overlays, click listeners,
  shadow roots, mutations, layout shift) from the deterministic checks. The accessibility snapshot
  is produced by the browser, but the DOM it describes is under the page's control. Treat a clean
  report on a site you do not trust as "nothing was observed", not "nothing is there".
- **This is not a security scanner for the target application.** The SAFETY dimension reports what
  an agent needs in order to act safely (confirmation steps, labelled boundaries, no hidden
  instructions). It does not test authentication, authorisation, injection flaws or any other
  vulnerability class of the scanned site.

## Recommendations for operators

- Default to the baseline agent and `read-only` tasks; add `--agent llm` when you need reasoning,
  and keep `--allow-forms` / `--allow-consequential` for staging environments or sites you own.
- Run in CI with the least privilege the Action documents (`contents: read`; `pull-requests: write`
  only for the sticky comment) and pass the LLM key as a secret. The Action posts its comment only
  on `pull_request` events; `pull_request_target` is not supported because it would run repository
  code from a fork with a write token.
- Treat `results.json` and `report.html` as containing text copied from the scanned site.
- Keep `--insecure` off outside private networks.
