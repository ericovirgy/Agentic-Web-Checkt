# GitHub release body for v0.1.0

Draft for maintainer review. The release workflow (`.github/workflows/release.yml`) fills the release
body from the matching `CHANGELOG.md` section automatically; this text is an alternative, shorter
body that can be pasted over it after the release is created, or merged into the changelog section.

---

## Agentic Web Check 0.1.0: Lighthouse for AI agents

First release. Scan a website in headless Chromium, measure how usable it is for AI agents, verify real tasks with a browser agent, and get fixes you can act on. Local-first, MIT, no API key required.

### What is included

- **43 checks across six dimensions** (PERCEPTION, NAVIGATION, INTERACTION, MACHINE INTERFACES, RELIABILITY, SAFETY), each with a rationale, a reference (WCAG criterion, Lighthouse audit, specification or documented agent failure mode), remediation text and bounded evidence. `agentic-web-check checks` lists them; `docs/SCORING.md` is the catalogue.
- **Perception at the agent's level.** The scan takes the AI-mode accessibility snapshot (`page.ariaSnapshot({ mode: 'ai' })`), the same tree Playwright MCP feeds to agents, runs selected axe-core rules, and inspects the live DOM for unnamed and fake controls, blocking overlays, hover-only menus, closed shadow roots, canvas-only UIs and bot walls.
- **Behavioural task verification** with programmatic verdicts (PASS, FAIL, BLOCKED, INCONCLUSIVE). Assertions: `url`, `text`, `title`, `element`, `answer`, `any_of`. Blocker detection for CAPTCHA, bot walls, login requirements, consent overlays without a named dismiss control and consequential steps. Step log, truncated snapshots, screenshots and token usage are kept per task.
- **Three built-in task archetypes** (`--tasks default`): contact, legal-policy, help-or-about. All read-only. Custom tasks come from a YAML file.
- **Two agent backends** over one tool surface: `baseline` (deterministic, no LLM, accessible-name matching) and `llm` (OpenAI-compatible chat/completions or Anthropic Messages API over plain `fetch`; Ollama and other local servers work through `AWC_LLM_BASE_URL`).
- **Safety review**: hidden text addressed to AI systems, consequential actions without a confirmation signal, forms over HTTP or cross-origin, WebMCP tool annotations, authentication boundary signalling, secret-looking tokens (redacted), unannounced downloads and new windows.
- **Outputs**: terminal, JSON (versioned `ScanResult` schema), single-file HTML, markdown summary, SVG badge, or `--out <dir>` for all of them plus screenshots.
- **GitHub Action** (`action/`): composite action, job summary, sticky PR comment, artifact upload, thresholds (`fail-under`, `fail-on-task-fail`, `fail-on`).
- **Benchmark harness** (`benchmark/run.ts`) with a `dev-fixtures` dataset and a `public-sample` candidate dataset.
- **Eight fixture sites** under `fixtures/sites/` (`excellent`, `webmcp`, `spa`, `poor-semantics`, `inaccessible`, `ambiguous-ui`, `auth-boundary`, `unsafe`) and a static fixture server.
- CLI commands `scan`, `test`, `ci`, `report`, `checks`; alias `awc`; exit codes 0 (thresholds met), 1 (threshold not met), 2 (runtime error).

### Known limitations

- Chromium only (Playwright). No Firefox or WebKit.
- Start page plus up to `--pages - 1` linked same-origin pages; not a whole-site crawl. Page discovery does not yet obey robots.txt `Disallow` rules (the `robots-agent-access` check reads robots.txt; the crawler does not).
- Thresholds marked INFERENCE in `docs/SCORING.md` (snapshot size, server-rendered text ratio, overlay coverage, hover-menu detection) are defensible defaults, not validated constants.
- The baseline agent is a floor, not a vendor agent. LLM results are non-deterministic; run several times.
- `llms-txt` and `webmcp` checks report publication, not whether any agent uses them.
- WebMCP detection relies on an injected `registerTool` stub and `form[toolname]`; other feature-detection patterns are missed.
- Hidden-instruction detection is pattern-based and English-centric.
- No CAPTCHA solving; a challenge is reported, not bypassed.
- **The public benchmark dataset has not been executed. No real-site numbers are claimed.** The `dev-fixtures` dataset (the eight local fixtures) is the only one that has been run.

### Try it in 30 seconds

```sh
npx playwright install chromium          # once, if you have no Chromium
npx agentic-web-check scan https://example.com --tasks default
```

Node 20 or newer. Add `--out awc-results` for the HTML report, JSON, markdown, badge and screenshots. For CI:

```yaml
- uses: ericovirgy/agentic-web-check/action@v0
  with:
    url: https://preview.example.com
    tasks: default
    fail-under: 70
```

### Methodology

Methodology version 1, result schema version 1. Check weights 10/7/3/1 follow the scale Lighthouse derives from axe-core impact levels; dimension weights are 20/15/20/10/15/20, with TASK SUCCESS at 30% when tasks run. Every number in a report can be recomputed from `results.json`. Scores are only comparable within one methodology version; the version is printed in every report and embedded in the badge. Details: `docs/SCORING.md`.

### Thanks

To the Playwright, axe-core and Lighthouse teams, whose public APIs, rule sets and scoring scale this project builds on, and to the authors of the agent benchmarks (WebArena, Mind2Web, WebVoyager and others) whose error analyses define the failure modes the checks target.

Full changelog: `CHANGELOG.md`.
