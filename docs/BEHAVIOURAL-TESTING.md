# Behavioural testing

Behavioural tests answer "can an agent finish this job on this site?" with evidence. A task is a
goal plus programmatic success criteria. An agent drives a real browser; the verdict is computed
from the final browser state, never from the agent's own claim of success. This document is the
reference for the task file, the assertions, the verdict rules, the two agents, the evidence that is
kept and the safety guards. The code is in `src/tasks/`.

## Running tasks

```sh
agentic-web-check scan https://example.com --tasks default           # built-in archetypes, baseline agent
agentic-web-check test https://example.com --tasks tasks.yaml        # your tasks, baseline agent
agentic-web-check test https://example.com --tasks tasks.yaml --agent llm
```

`scan` runs the deterministic checks and, with `--tasks`, the tasks; `test` is the same command with
`--tasks default` as its default. In both cases TASK SUCCESS is blended into the overall score at 30%
and the report header reads "Behavioural verification (N tasks, X agent)".

`--tasks default` runs the built-in archetypes from `src/tasks/archetypes.ts`: `contact` (find an
email address or phone number), `legal-policy` (find the privacy policy or terms), `help-or-about`
(find a page explaining the company or product). All three are `read-only` with a 12-step budget
and site-generic success criteria: `navigated: true` plus an `any_of` over common URL words
(`contact|contacto|support|kontakt`, `privacy|terms|legal|...`, `about|help|docs|faq|...`) and
heading names. Because `navigated` is required, a start page that already shows the information does
not pass; the agent has to reach a destination page.

## Task file

A YAML file with a top-level `tasks:` list (a bare list is also accepted).

```yaml
tasks:
  - name: find-return-window           # required; used in reports and screenshot names
    goal: Find out how many days customers have to return a bike.   # required
    safety: read-only                  # read-only (default) | form-submit | consequential
    start: /help                       # optional; path or absolute URL, default: the scanned URL
    max_steps: 12                      # optional; default 15
    hints: [returns, refunds]          # optional; accessible-name vocabulary for the baseline agent
    data: { query: trail }             # optional; synthetic data the agent may type (values become strings)
    success:                           # required, non-empty ("assert:" is accepted as an alias)
      - url: { includes: returns }
      - text: { includes: "30 days" }
```

Validation errors name the task and the field (`tasks.yaml tasks[2] (search): success must be a
non-empty list of assertions`) and exit with code 2.

`data` is the only text an agent will ever type. The baseline agent uses `data.query` (or
`data.search`) as the search query; the LLM agent receives the whole `data` object as "synthetic data
you may use". Never put real personal data in it.

## Assertions

Each list entry is an object with exactly one of the keys below. The fixture/benchmark shorthand
`{ type: url, includes: "..." }` is also accepted.

| Assertion | Holds when |
|---|---|
| `url: { includes: s }` | final URL contains `s` (case-insensitive) |
| `url: { equals: s }` | final URL equals `s`, ignoring trailing slashes |
| `url: { regex: r }` | final URL matches `r` (case-insensitive); several `url` keys may be combined in one object and all must hold |
| `text: { includes: s }` | `document.body.innerText` of the final page contains `s` after normalisation |
| `title: { includes: s }` | document title contains `s` after normalisation |
| `element: { role, name?, state? }` | the AI-mode accessibility snapshot of the final page has a node with that exact role whose name contains `name` (normalised); `state: checked` or `state: disabled` additionally requires that state |
| `answer: { must_include: [..], exact_match: s }` | the agent's returned answer is non-empty, contains every `must_include` entry and, when given, equals `exact_match` (all normalised) |
| `navigated: true` | the final URL differs from the task's start URL (trailing slashes ignored); use it so that a start page which merely contains the information does not pass |
| `any_of: [ ... ]` | at least one nested assertion holds |

Normalisation lowercases, strips accents and zero-width characters, and collapses whitespace.
Assertions are evaluated on the page the agent ended on, so `url` assertions should match the
destination, not a page passed on the way.

Accepted but not functional in this version: `element.url` is parsed, but the captured page state
does not record link targets, so an assertion with `url` never matches (observed: `no link`);
`element.state: visible` is ignored. Do not rely on them yet; use `url` or `text` assertions instead.

The `answer` assertion needs an answer. The LLM agent supplies it in its `finish` call. The baseline
agent has no language model, so when a task contains an `answer` assertion it uses the text of the
`main` landmark (or the body) of the final page, truncated to 2000 characters, as its answer. That
makes `answer: { must_include }` meaningful for the baseline ("the page the agent reached contains
the fact") while `exact_match` is only useful with the LLM agent.

## Verdicts

| Verdict | Rule |
|---|---|
| PASS | the agent finished with `done` and every `success` assertion holds |
| FAIL | the agent finished with `gave_up`, or exhausted its step budget or wall clock, or finished with `done` while at least one assertion does not hold; also when the assertions hold but the agent gave up (the site works, the agent did not notice) |
| BLOCKED | a blocker was detected: `captcha`, `bot-wall` (challenge markers in the page), `login-required` (visible password field with a sign-in prompt or auth-looking URL), `consent-overlay` (fixed element covering the viewport centre or more than 30% of it with no named dismiss control), `consequential-step` (the next action would submit a non-GET form or click a consequential control without opt-in), `http-error` (start URL returned 4xx/5xx) |
| INCONCLUSIVE | runner error: navigation timeout on the start URL, browser crash, LLM provider HTTP error or non-JSON response |

The `reason` string in the report explains the verdict in one line, the `blocker` field names the
blocker kind, and `assertions[]` lists each assertion with `holds` and what was `observed`.

TASK SUCCESS = 100 × PASS / (PASS + FAIL + BLOCKED). INCONCLUSIVE runs are excluded from the score
and listed in the report. With `--fail-on-task-fail`, any FAIL or BLOCKED sets exit code 1.

## Budgets

- Steps: `max_steps` from the task; otherwise `--max-steps` for the LLM agent; otherwise 15. Each
  tool call except `snapshot` and `finish` counts.
- Wall clock per task: the larger of 60 s and 4 × `--timeout` (default 120 s). Exceeding it ends the
  task as FAIL ("wall-clock budget exhausted").
- Each click, fill or key press has an 8 s timeout; `navigate` and `back` have 20 s.
- Snapshots handed to the LLM agent are truncated to 24,000 characters.

## Agents

Both agents use the same `BrowserTools` surface (`src/tasks/tools.ts`): `snapshot`, `click(ref)`,
`type(ref, text, submit?)`, `select(ref, value)`, `press(key)`, `navigate(url)`, `scroll(direction)`,
`back()`, `finish(status, reason, answer?)`. Refs are the `[ref=eN]` identifiers from Playwright's
AI-mode accessibility snapshot, resolved with `aria-ref=` locators. After every action the runner
waits for `load` (up to 5 s) plus 300 ms, takes a fresh snapshot and records whether anything changed
(`noFeedback`). Links that open a new tab are handled for the single-tab agent: a same-origin popup is
closed and its URL is opened in the main tab; a popup to another origin is closed and noted in the
step result, not followed.

### baseline (default, no LLM)

Deterministic. Per step it takes a snapshot, checks for blockers, and stops with `done` as soon as the
success assertions hold. Otherwise, in order:

1. If a `dialog` or `alertdialog` is in the snapshot and nothing has been dismissed yet, click the
   first button whose name is a dismiss word (reject/close preferred over accept), once.
2. If the task has `data.query` and an unused `searchbox` (or a textbox named like a search field)
   exists, type the query and press Enter.
3. Otherwise click the unvisited `link`, `button`, `menuitem` or `tab` whose accessible name (and
   URL) best matches the keyword set: the goal's words minus stop words and the site's own name,
   expanded with synonyms from `src/tasks/keywords.ts`, plus `hints` (which get a bonus).
4. If nothing matches, scroll down once; if that changes nothing, give up.

It gives up when the same page state is seen three times (controls had no visible effect), the step
budget or wall clock runs out, or no control matches. The step log then shows what it could see, which is the point: a
baseline failure is attributable to a perception gap on the page, not to reasoning.

### llm

A tool-calling loop (`src/tasks/llm-agent.ts`) with the tools above as JSON Schema function
definitions, temperature 0. Providers (`src/tasks/llm-provider.ts`):

| Variable | Meaning | Default |
|---|---|---|
| `AWC_LLM_PROVIDER` | `openai` (any OpenAI-compatible `chat/completions` endpoint) or `anthropic` (Messages API) | `openai` |
| `AWC_LLM_MODEL` | model id | `gpt-4.1-mini` / `claude-sonnet-5-5` |
| `AWC_LLM_API_KEY` | API key; falls back to `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` | none (header omitted) |
| `AWC_LLM_BASE_URL` | endpoint base | `https://api.openai.com/v1` / `https://api.anthropic.com` |

`--provider` and `--model` override the variables. From the CLI the provider is `openai` unless you
set `--provider anthropic` or `AWC_LLM_PROVIDER=anthropic`. Local models: any OpenAI-compatible
server works, for example Ollama with `AWC_LLM_BASE_URL=http://localhost:11434/v1` and no key.

The system prompt tells the model it is evaluating a website, must stay on the origin, must not
invent answers, must respect the task's safety level and may only use the task's synthetic data. On
the last step the model is forced to call `finish`. Token usage (`inputTokens`, `outputTokens`,
`calls`) is recorded per task. Results vary between runs; treat a single LLM run as one sample.

## Evidence

Every `TaskResult` in `results.json` contains: `name`, `goal`, `verdict`, `reason`, `agent`, `model`,
`safety`, `startUrl`, `finalUrl`, `finalTitle`, `steps[]` (index, tool, args, result summary, URL,
duration, `snapshotBefore` truncated to 1500 characters, `noFeedback`, `error`), `assertions[]`
(assertion, `holds`, `observed`), `answer`, `blocker`, `screenshots[]`, `consoleErrors[]`,
`durationMs`, `usage` (LLM only) and `error` (INCONCLUSIVE only). Screenshots are written only when
`--out` is set: `<out>/screenshots/<task>-start.png` and `-end.png` or `-failure.png`. The HTML report
and `--verbose` terminal output show the steps.

## Safety

| Class | What the runner allows |
|---|---|
| `read-only` (default) | navigation, typing, GET form submission (search). Submitting a non-GET form or clicking a control with a consequential name ends the task as BLOCKED (`consequential-step`). |
| `form-submit` | as above, plus non-GET form submission when the CLI runs with `--allow-forms`. Without the flag the task is BLOCKED at the submit. |
| `consequential` | as above, plus clicking consequential controls when the CLI runs with `--allow-consequential`. Without the flag the task is BLOCKED at the consequential step. Use only on sites you own. |

Consequential names come from a fixed vocabulary (`CONSEQUENTIAL_WORDS` in
`src/browser/page-data.ts`: buy, purchase, pay, checkout, place order, subscribe, unsubscribe,
delete, send, transfer, cancel, and similar) matched as whole words in the control's accessible
name. The `navigate` tool refuses URLs outside the scanned origin. The guard is applied to clicks and
to `type` with `submit: true`; see `docs/SECURITY-MODEL.md` for what it does not cover.
