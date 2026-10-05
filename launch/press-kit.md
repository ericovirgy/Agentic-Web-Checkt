# Press kit

All facts below are traceable to the repository at `a8f29de` or to npm on 2026-10-05.

## Facts

| Item | Value |
|---|---|
| Name | Agentic Web Check (CLI aliases: `agentic-web-check`, `awc`) |
| Repository | https://github.com/ericovirgy/agentic-web-check |
| npm | https://www.npmjs.com/package/agentic-web-check, version 0.1.0 |
| Licence | MIT |
| Requirements | Node >= 20; Chromium via Playwright (`npx playwright install chromium`) or `--browser-path` |
| Checks | 43 across six dimensions (perception, navigation, interaction, machine interfaces, reliability, safety), plus task success when tasks run |
| Tasks | Programmatic success assertions. Verdicts: PASS, FAIL, BLOCKED, INCONCLUSIVE |
| Agents | `baseline` (deterministic, no key) and `llm` (OpenAI-compatible endpoint or Anthropic API) |
| Outputs | Terminal, JSON, HTML (self-contained), Markdown, SVG badge |
| CI | Experimental GitHub Action (`ericovirgy/agentic-web-check/action@v0`), run only in this repository so far |
| Privacy | No telemetry. Network: target site, plus the LLM provider you configure with `--agent llm` |
| Maturity | Version 0.1.0, methodology v1. Thresholds marked INFERENCE in `docs/SCORING.md` are defensible defaults, not validated constants |

## What exists and what does not

| Exists | Does not exist yet |
|---|---|
| Release validation: 16 public sites, baseline agent, two runs on 2026-10-05, recorded in `docs/validation/real-world-2026-10-05.md` | A public benchmark run. `public-sample` has not been executed |
| One real-model smoke task (`qwen2.5:3b`, CPU, fixture `excellent`), two runs, different task outcomes | Any claim about model quality |
| Eight local fixture sites and an offline regression benchmark | Third-party users, testimonials or adoption figures |
| Pipeline proof: real browser, real model, programmatic verdict | npm provenance for 0.1.0 |

## Boilerplate

Agentic Web Check is an MIT-licensed command-line tool that tests whether AI agents can use a
website. It loads a site in headless Chromium, runs 43 deterministic checks on what an agent
perceives, optionally runs read-only tasks with a browser agent and decides the result from
assertions on the final page state, and reviews the site for agent-directed risks. It needs no API
key for its default mode and sends no telemetry.

## Founder note

Placeholder owned by the maintainer: write two or three first-person sentences on why you built it.
Not drafted here because it would be invented biography.

## Visual assets (to create, none exist yet)

| Asset | Source | Note |
|---|---|---|
| Terminal screenshot | `docs/examples/terminal-output.txt` rendered | Fixture `ambiguous-ui`, 58/100. Label it as a fixture |
| HTML report screenshot | `docs/examples` plus `--html` on the fixture | Self-contained file |
| Badge | `--badge` output | Wording reflects what was run, never "safe" |
| Social preview 1280x640 | Text in `launch/github-optimisation.md` | Typeset, no logos of other projects |

## Contact

Maintainer: Erico (GitHub: ericovirgy). Preferred route for press: a GitHub issue or Discussion on
the repository, or the email the maintainer chooses to publish. No address is stated here.
