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
A dimension with no scorable checks is reported as `n/a` and excluded from the overall.

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
| `page-load` | 10 | prerequisite | final HTTP status 2xx/3xx→2xx, load event within budget; on failure the other dimensions are `na` |
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
| BLOCKED | runner detected CAPTCHA/bot wall/login requirement/consent overlay without dismiss, or the next step would be consequential without opt-in |
| INCONCLUSIVE | navigation error, browser crash, provider error, or assertions impossible to evaluate |

Assertions (all must hold unless `any_of` is used): `url` (`includes`/`equals`/`regex`), `text` (`includes`,
normalised whitespace/case), `element` (`role`+`name` present, optional `state`), `title` (`includes`),
`answer` (`must_include` / `exact_match` against the agent's returned answer, normalised). This is the
WebArena shape (FACT, research/04 §1) without LLM judges.

## 5. What the score is not

- Not a security assessment of the application.
- Not a measure of whether any specific vendor's agent will succeed; it measures what the common
  perception layer (accessibility tree + axe) exposes and what two agent backends observed.
- Not comparable across versions: the methodology version is embedded in every result (`methodology: "1"`).
