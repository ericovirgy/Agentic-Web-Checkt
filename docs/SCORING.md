# Scoring methodology (v1)

The score answers one question per dimension and is reproducible from the JSON output: every number can be
recomputed from the listed checks, their weights and their statuses. Nothing is hidden behind the total.

## 1. Check results

Every check produces:

| Field | Values |
|---|---|
| `status` | `pass`, `warn`, `fail`, `na` (not applicable: excluded from scoring), `info` (reported, never scored) |
| `score` | `pass` = 1, `warn` = 0.5, `fail` = 0 |
| `weight` | 10 critical, 7 serious, 3 moderate, 1 minor |
| `evidence` | url, selector/ref, observed, expected, counts, snippets (bounded) |
| `remediation` | what to change, with a reference |

DESIGN DECISION: the 10/7/3/1 weights are the ones Lighthouse derives from axe-core impact levels for its
accessibility category (FACT, `research/04-benchmarks-a11y-security.md` §8). Reusing them gives a
defensible, documented scale rather than an invented one. The impact assigned to each check is justified in
the catalogue below with the failure mode it maps to.

Dimension score = round(100 × Σ(score × weight) / Σ(weight)) over checks with status `pass|warn|fail`.
A dimension with no scorable checks is reported as `n/a` and excluded from the overall. Pages that answer
with HTTP 4xx/5xx are listed but excluded from check aggregation, and consequential links (delete, pay,
unsubscribe…) are never followed when selecting additional pages.

**A dimension score is only as broad as its scorable checks.** `na` and `info` checks drop out of both the
numerator and the denominator, so a dimension in which a single check is scorable is 100 from one pass and
0 from one fail (SAFETY on a page with no forms, no WebMCP, no consequential controls and no downloads is
scored by `hidden-instructions` alone). Every report shows the counts next to the score (`pass · warn ·
fail · N of M checks scored` in the terminal, a `Scored` column in markdown and HTML); read the score
together with that breadth. Crashed checks are `na` with an `error` field; the terminal and markdown
summaries always print a one-line "N checks crashed and were not scored" note so an exception cannot
silently narrow a dimension.

**Start-page gate.** When the start page does not load (navigation error, or an HTTP 4xx/5xx answer),
every check except `page-load` and `challenge-or-bot-wall` is `na` ("Not evaluated: start page did not
load"), so RELIABILITY is the only scored dimension. `page-load` fails; `challenge-or-bot-wall` fails
(403/429/503 or challenge markers) or is `na` (navigation error with no markers), so the overall is 0.
Known gap: a start page that answers another 4xx/5xx (404, 500…) without challenge markers passes
`challenge-or-bot-wall`, which puts RELIABILITY at 50 and the overall at 50; nothing else can raise it.

## 2. Dimensions and overall

| Dimension | Question | Weight (no tasks) | Weight (with tasks) |
|---|---|---|---|
| PERCEPTION | Does the accessibility tree describe the page truthfully and completely? | 20 | 14 |
| NAVIGATION | Can an agent find where things are? | 15 | 10.5 |
| INTERACTION | Can an agent operate the controls? | 20 | 14 |
| MACHINE INTERFACES | Are machine-readable entry points published? | 10 | 7 |
| RELIABILITY | Does the page reach a stable, accessible state for an automated browser? | 15 | 10.5 |
| SAFETY | Does the site give an agent what it needs to act safely? | 20 | 14 |
| TASK SUCCESS | Did real tasks complete, verified programmatically? | not scored | 30 |

Overall = Σ(dimension × weight) / Σ(weight) over available dimensions, rounded. The report always states
the mode: **Deterministic scan** (no tasks) or **Behavioural verification (N tasks, agent X)**.

DESIGN DECISION on weights: perception, interaction and safety carry the most weight because the benchmark
error analyses attribute most agent failures to grounding (unnamed/ambiguous controls), interaction
(overlays, custom widgets) and blocking (bot walls), and because safety failures are the ones with real-world
cost. Machine interfaces are weighted low on purpose: FACT, llms.txt adoption by agents is unverified
(97% of files get zero requests, Ahrefs) and WebMCP is an origin trial. With tasks, observed task success
takes 30% because observed behaviour outranks inferred behaviour (project principle).

TASK SUCCESS = 100 × PASS / (PASS + FAIL + BLOCKED). INCONCLUSIVE runs are excluded and reported.

BLOCKED counts as a failure on purpose: a blocked task is a task the agent could not finish, and the
things that block it (CAPTCHA, bot wall, login wall, consent overlay without a named dismiss, HTTP error)
are site properties. The one exception is a task declared `safety: consequential` that was BLOCKED with
blocker `consequential-step`, i.e. the runner's own guard stopped it because the scan ran without
`--allow-consequential` (or without `--allow-forms` for its form submission). That block is the user's
choice, not a site defect, so the task is excluded from the denominator exactly like an INCONCLUSIVE run;
it is still listed with its verdict, and the summary line says "N BLOCKED not scored: consequential task
run without --allow-consequential". A `consequential-step` block on a `read-only` or `form-submit` task
stays in the denominator: there the agent reached a consequential or form-submitting control while
pursuing a goal that was declared harmless, which is exactly the kind of surprise the score should expose.

When no task counts (none ran, all INCONCLUSIVE, or all excluded as above), TASK SUCCESS is `n/a`, the
deterministic weights are not scaled, and the report mode reads "Behavioural run … no task counted, task
success not scored" rather than "verification". The badge then says `scan`, never `verified`.

When behavioural tasks ran, every task that did not PASS is stated in one line under the overall
("N of M behavioural tasks did not pass (x FAIL, y BLOCKED, z INCONCLUSIVE)") in the terminal and markdown
summaries, because the blend can hide them: all checks passing with every task failing gives
0.7 × 100 + 0.3 × 0 = **70**, which reads as a decent score unless the task line is there.

### Sensitivity

How much one check can move the score. "Dimension cost" is the drop in that dimension when one check of the
given weight fails and every other catalogued check in the dimension is scorable and passes; the overall
cost multiplies it by the dimension weight (no tasks) or the scaled weight (with tasks). Fewer scorable
checks make each one count for more (see §1), so these are lower bounds for a given report.

| Dimension | Σ catalogue weights | Heaviest check | Dimension cost | Overall cost (no tasks) | Overall cost (with tasks) |
|---|---:|---:|---:|---:|---:|
| PERCEPTION | 42 | 10 | −24 | −4.8 | −3.3 |
| NAVIGATION | 25 | 7 | −28 | −4.2 | −2.9 |
| INTERACTION | 43 | 10 | −23 | −4.7 | −3.3 |
| MACHINE INTERFACES | 24 | 7 | −29 | −2.9 | −2.0 |
| RELIABILITY | 33 | 10 | −30 | −4.5 | −3.2 |
| SAFETY | 34 | 10 | −29 | −5.9 | −4.1 |
| TASK SUCCESS (N counted tasks) | — | one task | −100/N | — | −30/N |

A `warn` costs half of the listed dimension cost. The maximum influence of any single dimension on the
overall is its weight (20 points without tasks, 14 with, 30 for TASK SUCCESS); when other dimensions are
`n/a` the remaining weights are renormalised, so with the start-page gate RELIABILITY alone decides the
overall. The scaled deterministic weights (14 + 10.5 + 14 + 7 + 10.5 + 14) sum to exactly 70, and the
overall is a weighted mean of values in 0..100 rounded once, so it cannot leave 0..100: all checks and all
tasks passing is 100, all failing is 0.

## 3. Check catalogue

Abbreviations: WCAG = WCAG 2.2 success criterion; LH = Lighthouse audit id; FM = documented failure mode in
`research/04` (benchmarks) or `research/01` (agent tooling docs).

### PERCEPTION

| id | w | Why (reference) | Detection |
|---|---|---|---|
| `control-accessible-name` | 10 | WCAG 4.1.2; LH `agent-accessibility-tree` (button-name, link-name, label, select-name); FM grounding errors | interactive nodes in the AI snapshot (`button`, `link`, `textbox`, `combobox`, `checkbox`, `radio`, `slider`, `switch`, `tab`, `menuitem`, `searchbox`, `spinbutton`, `listbox`, `option`) with empty name; cross-checked with axe |
| `fake-interactive-elements` | 7 | WCAG 4.1.2; FM: agents list controls by role (Playwright MCP, Chrome DevTools MCP, agent-browser) and only fall back to `cursor:pointer` | `generic [cursor=pointer]` nodes in the snapshot, DOM elements with click handlers and no role; ratio to total interactive |
| `aria-validity` | 7 | WCAG 4.1.2; LH agent tree includes aria-* rules | axe: `aria-allowed-attr`, `aria-required-attr`, `aria-required-children`, `aria-required-parent`, `aria-roles`, `aria-valid-attr`, `aria-valid-attr-value`, `aria-hidden-body`, `aria-hidden-focus`, `aria-prohibited-attr` |
| `ambiguous-control-names` | 3 | WCAG 2.4.4; FM: "Read more"/"Click here" repeated with different targets causes wrong clicks | same accessible name on ≥2 links with different hrefs, or generic names from a fixed list |
| `label-in-name` | 3 | WCAG 2.5.3 | axe `label-content-name-mismatch` |
| `document-title-lang` | 3 | WCAG 2.4.2, 3.1.1; LH `document-title`, `html-has-lang` | axe + non-generic title (not "Home", "Untitled", domain only) |
| `heading-structure` | 3 | WCAG 2.4.6, 1.3.1; FM: agents navigate by headings | axe `page-has-heading-one`, `heading-order`, `empty-heading` |
| `image-alt` | 3 | WCAG 1.1.1; LH `image-alt` | axe `image-alt`, `svg-img-alt`, `role-img-alt`, `input-image-alt` |
| `snapshot-budget` | 3 | FM: trees above ~10k tokens get truncated by agent harnesses (research/01 §14) | AI snapshot size: pass < 40k chars, warn < 100k, fail ≥ 100k (INFERENCE thresholds) |

### NAVIGATION

| id | w | Why | Detection |
|---|---|---|---|
| `landmarks` | 7 | WCAG 1.3.1, 2.4.1; LH `landmark-one-main`, `bypass`, `region` | exactly one `main`; at least one `navigation` landmark; axe `bypass`, `region` |
| `navigation-links-usable` | 7 | WCAG 2.4.4; FM navigation stuck (WebVoyager 44%) | links inside `navigation` landmarks: named, href not `#`/`javascript:`, deduplicated |
| `hover-only-menus` | 3 | FM: hover-only menus invisible to tree agents (research/01 §14) | links in DOM under `nav` not present in the snapshot and with no `aria-expanded`/button toggle ancestor (INFERENCE heuristic) |
| `key-pages-discoverable` | 3 | FM: common agent goals (contact, policies, help, search) | start-page links whose names match contact/about/help/privacy/terms/search vocabularies |
| `search-available` | 1 | schema.org `SearchAction`; ARIA `search` landmark | `role=search`, `input[type=search]`, `WebSite.potentialAction.SearchAction` |
| `sitemap` | 3 | sitemaps.org; crawl discoverability | `/sitemap.xml` reachable or `Sitemap:` in robots.txt |
| `breadcrumbs` | 1 | schema.org `BreadcrumbList`; WCAG 2.4.8 | JSON-LD `BreadcrumbList` or `nav[aria-label*=breadcrumb]`; `na` on the start page when it is the root |

### INTERACTION

| id | w | Why | Detection |
|---|---|---|---|
| `form-fields-labelled` | 10 | WCAG 3.3.2, 4.1.2; LH `label`, `select-name`; FM write tasks succeed far less than read (Web Bench) | axe `label`, `select-name`, `form-field-multiple-labels`, `autocomplete-valid`; fields without `name` |
| `overlay-interference` | 10 | FM: consent banners/modals intercept clicks (agent-browser docs, BrowserArena, GUI-Robust) | fixed/sticky elements covering the viewport centre or >30% of the viewport after load; whether a named dismiss control exists (accept/close/reject/ok vocabulary) |
| `native-controls` | 7 | FM: date pickers, sliders, drag-drop, custom dropdowns (WILBUR, WebGames) | share of interactive nodes that are ARIA-only widgets (`slider`, `combobox`/`listbox` without `select`, `role=textbox` without input, `contenteditable`) and drag handles |
| `required-fields-marked` | 3 | WCAG 3.3.2 | fields with required visual markers (`*` in label) but no `required`/`aria-required` |
| `keyboard-operability` | 3 | WCAG 2.1.1; LH `tabindex`; FM: agents press keys to operate controls | axe `tabindex`, `focus-order-semantics`; interactive nodes with `tabindex=-1` |
| `cross-origin-iframe-controls` | 3 | FM: agents cannot act inside cross-origin iframes (Comet, Playwright ref scoping) | interactive nodes under `iframe` whose src origin differs |
| `closed-shadow-roots` | 3 | FM: closed shadow DOM hides controls from tree agents | init-script hook on `attachShadow` counting `mode:'closed'` roots that contain interactive elements |
| `canvas-only-ui` | 3 | FM: canvas/WebGL UIs expose no tree | `canvas` covering >50% of viewport with <5 interactive nodes |
| `target-size` | 1 | WCAG 2.5.8; FM: vision agents miss small targets | axe `target-size` |

### MACHINE INTERFACES

| id | w | Why | Detection |
|---|---|---|---|
| `robots-agent-access` | 7 | REP (RFC 9309); user-triggered agent fetchers honour robots (research/02 §12) | robots.txt parsed for `*`, `ChatGPT-User`, `Claude-User`, `OAI-SearchBot`, `Claude-SearchBot`, `PerplexityBot`, `Google-Extended`; fail if the scanned path is disallowed for `*` or for all user-triggered agents; `Content-Signal` reported as info |
| `server-rendered-content` | 7 | FM: fetch-based agents and crawlers do not execute JS (INFERENCE from vendor docs) | text length of raw HTML (JS disabled) vs rendered DOM; warn < 50%, fail < 20% |
| `structured-data` | 3 | schema.org / JSON-LD | valid JSON-LD blocks; relevant types listed (`Organization`, `WebSite`, `Product`, `Offer`, `FAQPage`, `ContactPoint`, `BreadcrumbList`) |
| `llms-txt` | 3 | llmstxt.org; LH `llms-txt` | `/llms.txt` 200 with H1 and ≥1 markdown link. Reported as "published"; agent usage is UNVERIFIED |
| `webmcp` | 3 | W3C WebML CG draft; Chrome origin trial M149–M156 | `form[toolname]` elements; stub on `document.modelContext`/`navigator.modelContext` capturing `registerTool`; `@mcp-b/` fingerprints. Absence = `info`, presence = `pass` with tool list |
| `agent-manifests` | 1 | A2A `agent-card.json`, UCP `/.well-known/ucp`, ARD `ai-catalog.json` | HEAD/GET probes; `info` when absent |

### RELIABILITY

| id | w | Why | Detection |
|---|---|---|---|
| `page-load` | 10 | prerequisite (gate) | final HTTP status 2xx/3xx→2xx, load event within budget. When the start page does not load, every other check except `challenge-or-bot-wall` is `na`, so RELIABILITY is the only scored dimension and the overall is 0 |
| `challenge-or-bot-wall` | 10 | WCAG 3.3.8; FM: access/CAPTCHA/loading errors are 51% of Online-Mind2Web failures | 403/429/503 with challenge markers (`cf-challenge`, `recaptcha`, `hcaptcha`, `turnstile`, "verify you are human"); UA-parity probe: plain `fetch` with our UA vs rendered browser |
| `dom-stability` | 7 | FM: stale refs after mutations (Playwright MCP, agent-browser) | mutation count in the 2 s after `load`+network idle; layout shift score via `PerformanceObserver` |
| `network-settles` | 3 | FM: `networkidle` never reached on SSE/WebSocket sites | network idle reached within 10 s |
| `console-errors` | 3 | runtime errors correlate with broken interactions (INFERENCE) | uncaught exceptions and failed resource loads of scripts |

### SAFETY

| id | w | Why | Detection |
|---|---|---|---|
| `hidden-instructions` | 10 | OWASP LLM01:2025; Brave/Comet incident; WebMCP `untrustedContentHint` | text in DOM that is hidden (display/visibility/opacity/font-size/off-screen/clip/colour match/aria-hidden/HTML comments/zero-width) matching imperative-instruction patterns aimed at AI systems |
| `consequential-actions-guarded` | 7 | OWASP LLM01 mitigation (human approval for high-risk ops); vendor confirmation taxonomies (purchase, pay, transfer, send, delete, cancel, grant) | controls whose name matches the taxonomy; `warn` when any is an immediate action (form submit / button) without a confirmation signal (`aria-haspopup=dialog`, `confirm(` in handler, confirmation text in the form) |
| `forms-safe-transport` | 7 | OWASP; credential leakage | forms posting over `http:` or to a different origin; password fields on non-HTTPS pages |
| `webmcp-tool-annotations` | 3 | WebMCP spec Security section (`readOnlyHint`, `consequentialHint`, `untrustedContentHint`); `toolautosubmit` | tools with mutating names and no `consequentialHint`; declarative forms with `toolautosubmit` on consequential actions; `na` without WebMCP |
| `auth-boundary-signalled` | 3 | FM: login pages derail agents when unlabelled (GUI-Robust) | password fields inside a labelled form with a named submit; credential inputs outside forms |
| `exposed-secrets` | 3 | credential exposure | token patterns (AWS, GitHub, Stripe live, OpenAI, Anthropic, Slack, private keys) in HTML/inline scripts; values are redacted in the evidence |
| `download-and-popup-links` | 1 | FM: unexpected downloads/new windows derail browser agents | `a[download]`, links to binary extensions, `target=_blank` without "(opens in new window)"-style naming |

## 4. Verdicts for tasks

| Verdict | Rule |
|---|---|
| PASS | agent called `finish` with `done` AND all `success` assertions hold on the final state |
| FAIL | agent called `finish` with `gave_up`, or assertions fail, or step budget/wall clock exhausted |
| BLOCKED | runner detected CAPTCHA/bot wall/login requirement/consent overlay without dismiss, or the next step would be consequential without opt-in (`blocker` names the cause) |
| INCONCLUSIVE | navigation error, browser crash, provider error, or assertions impossible to evaluate |

BLOCKED and FAIL both count against TASK SUCCESS (§2). The single exception is `blocker: consequential-step`
on a task with `safety: consequential`, which is the user's own opt-out (`--allow-consequential` not
passed) and is excluded from the score; the verdict stays BLOCKED in the task list and in the JSON.

Assertions (all must hold unless `any_of` is used): `url` (`includes`/`equals`/`regex`), `text` (`includes`,
normalised whitespace/case), `element` (`role` present, optional `name`, `url` and `state`), `title`
(`includes`), `answer` (`must_include` / `exact_match` against the agent's returned answer, normalised) and
`navigated` (the final URL differs from the task start URL, so a PASS needs at least one navigation). This is
the WebArena shape (FACT, research/04 §1) without LLM judges. The built-in archetypes all require `navigated`
plus a destination criterion, so a start page that merely contains the information does not pass.

The baseline agent knows the success criteria and stops as soon as they hold; what it measures is whether the
site's accessible names let the weakest reasonable agent reach the goal state.

## 5. What the score is not

- Not a security assessment of the application.
- Not a measure of whether any specific vendor's agent will succeed; it measures what the common
  perception layer (accessibility tree + axe) exposes and what two agent backends observed.
- Not comparable across versions: the methodology version is embedded in every result (`methodology: "1"`).
