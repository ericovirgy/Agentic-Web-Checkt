# Curator pack

Use as-is for forms and list entries. Every line is traceable to the repo.

## One line
Open-source browser evaluator for whether AI agents can actually use websites.

## Short
Agentic Web Check is an open-source CLI that loads a site in headless Chromium, runs 43 deterministic checks, tries read-only tasks and decides each verdict from assertions on the final page. No API key for the default mode, no telemetry. MIT.

## Why now
AI agents increasingly browse on behalf of people, and a site can look machine-readable while still blocking an agent on a basic task. This tool lets you see where.

## Why it is different
It combines a deterministic perception audit, task verdicts decided by programmatic assertions in a real browser, and a site-side safety review, in one local CLI. Complementary to Lighthouse's Agentic Browsing category and to the AgentReady spec, not a replacement for either.

## Proof (confirmed only)
- `npm view agentic-web-check version` returns 0.1.0; CI green on `main`.
- Fixture `ambiguous-ui`: perception 81, three tasks BLOCKED by a consent overlay without a named dismiss control (`docs/examples/terminal-output.txt`). Fixture, deliberately broken.
- Release validation on 2026-10-05: 16 public sites, baseline agent, two runs, no crash, recorded in `docs/validation/real-world-2026-10-05.md`. Validation, not a benchmark.
- No public benchmark has been run. No third-party users are claimed.

## Links
- Repository: https://github.com/ericovirgy/agentic-web-check
- npm: https://www.npmjs.com/package/agentic-web-check
- Release: https://github.com/ericovirgy/agentic-web-check/releases/tag/v0.1.0
- Scoring: https://github.com/ericovirgy/agentic-web-check/blob/main/docs/SCORING.md
- Security model: https://github.com/ericovirgy/agentic-web-check/blob/main/docs/SECURITY-MODEL.md

## Awesome-list lines (one per list, hand-written PRs, disclose authorship)

| List | Section | Line |
|---|---|---|
| awesome-playwright | Utils | `- [Agentic Web Check](https://github.com/ericovirgy/agentic-web-check) - CLI built on Playwright that checks whether AI agents can use a website, using accessibility snapshots, 43 checks and assertion-based task verdicts.` |
| awesome-testing | Software > Accessibility & Usability Testing | `[Agentic Web Check](https://github.com/ericovirgy/agentic-web-check) - Open-source CLI that tests whether AI agents can use a website, with deterministic checks and programmatic task verdicts.` (confirm the exact list format, hyphen style and alphabetical placement in the live README) |
| awesome-web-agents | Dev Tools (or Benchmarks & Research) | `- [Agentic Web Check](https://github.com/ericovirgy/agentic-web-check) - Open-source CLI that evaluates whether web agents can complete tasks on a site, with programmatic task verdicts and a safety review.` PR title: `Add: Agentic Web Check`. Disclose: "I am the author." |
| awesome-browser-automation | AI | `* [Agentic Web Check](https://github.com/ericovirgy/agentic-web-check) - Open-source CLI that evaluates how well a website works for browser agents, using accessibility snapshots and assertion-based task verdicts.` |
