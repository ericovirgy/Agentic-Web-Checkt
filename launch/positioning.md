# Positioning

## Candidate headlines

Primary (question): **Can an AI agent actually use your website?**

Secondary: **Agentic Web Check tests the gap between machine-readable and machine-operable websites.**

Technical hook: it reads the same AI-mode accessibility snapshot Playwright's MCP server sends to a
model (`page.ariaSnapshot({ mode: 'ai' })`), runs 43 deterministic checks, then lets an agent try
real tasks. The verdict comes from assertions on the final browser state, never from the agent
saying it finished.

Safety hook: the same run reviews the site for agent-directed risks: hidden text addressed to AI
systems, buy or delete buttons without a confirmation step, forms posting over HTTP, WebMCP tools
without safety annotations.

## Variants

| Audience | Line |
|---|---|
| Developer | A local CLI: `npx agentic-web-check scan <url> --tasks default`. Headless Chromium, 43 checks, three read-only tasks, JSON/HTML/Markdown/badge output, no API key, no telemetry. |
| Website owner | Find out where an AI agent gets stuck on your site and what to change, before a customer's agent does. |
| Research and media | A reproducible way to ask whether sites that look agent-ready to a static scanner let an agent finish a task. A public benchmark is planned and has not been run. |

## Strongest narrative

For a developer audience: **"A page can look agent-ready and still stop an agent from finishing a
two-click task. This tool runs the task and shows where it got stuck."**

Why this one: it is demonstrable today with a shipped fixture. The `ambiguous-ui` fixture scores
PERCEPTION 81 and NAVIGATION 75, yet all three baseline tasks end BLOCKED because of a consent
overlay without a named dismiss control (`docs/examples/terminal-output.txt`). It is a deliberately
broken fixture, so it illustrates the mechanism, it is not evidence about the web at large.

Rejected for now: "Static AI-ready signals do not predict task completion" as a statement of fact.
No benchmark supports it. It can be used as a question ("do they?") until one does.

## Differentiation (supportable wording)

- Local and open source (MIT), deterministic perception layer with no LLM and no key.
- Runs tasks in a real browser with programmatic success assertions and four verdicts
  (PASS, FAIL, BLOCKED, INCONCLUSIVE).
- Adds a site-side safety review. In the research pass of 2026-10-05 no tool covering all three in
  one local CLI was found. That is "not found in searches", not "does not exist".

## Complementary, not competing

| Project | Relationship |
|---|---|
| Lighthouse "Agentic Browsing" category (experimental, Chrome 150+) | Reads a page: WebMCP registration, agent-facing accessibility, llms.txt, layout shift. Fractional score. We do not re-implement it. A Lighthouse adapter is on our roadmap. |
| AgentReady standard (agentready.org) | A requirements spec for Find, Read, Act. Its scoring is deliberately implementation-defined. Mapping our checks to its IDs has NOT been done, so no compliance claim. |
| Playwright MCP, agent-browser, Stagehand, browser-use | Give agents hands. We grade the site. We use the same snapshot idea. |
| WebArena, Mind2Web, BrowserGym | Research benchmarks on fixed or recorded sites. We target any live URL. |

## Words to avoid

"first", "only", "unique", "Lighthouse for AI agents" (or any equivalence), "guarantees agents will
succeed", "safe" as a verdict (the badge deliberately never says it), "benchmark results", "used by",
"provenance" for 0.1.0, "AgentReady compliant".
