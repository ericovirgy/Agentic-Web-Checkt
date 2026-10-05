# X: 10-post sequence

Drafts. The maintainer posts from their own account, in their own words. No hashtags spam, no
requests for reposts, no tagging people who did not ask. Attach real screenshots only.

1. Can an AI agent actually use your website? I built a CLI that runs real tasks in a browser and shows where the agent gets stuck. Open source, MIT. https://github.com/ericovirgy/agentic-web-check
2. One command: `npx agentic-web-check scan https://your.site --tasks default`. It loads the site in headless Chromium, runs 43 checks, then tries three read-only tasks. First run needs `npx playwright install chromium`.
3. The idea: a page can describe itself well to machines and still block an agent. In one of my test fixtures the accessibility checks score 81 and all three tasks are BLOCKED by a cookie wall with no named close button. (Fixture, deliberately broken. Screenshot attached.)
4. How a task verdict is decided: assertions on the final page state (URL, text, title, element). The agent saying "done" counts for nothing. Verdicts: PASS, FAIL, BLOCKED, INCONCLUSIVE.
5. The default agent is deterministic and needs no API key. An LLM agent is optional, over any OpenAI-compatible endpoint or the Anthropic API. The baseline is a floor, not a vendor agent.
6. It also reviews the site for agent-directed risks: hidden text addressed to AI systems, delete or buy buttons with no confirmation step, forms posting over HTTP, WebMCP tools without safety annotations.
7. It reads the same AI-mode accessibility snapshot Playwright's MCP server sends to a model, via `page.ariaSnapshot({ mode: 'ai' })`. Not affiliated with Playwright; it is built on it.
8. What it does not do: no telemetry, no crawling beyond a few pages, no CAPTCHA solving, no form submits unless you opt in. Chromium only. Some thresholds are defaults, not validated constants.
9. What I have and have not measured: a validation run on 16 public sites with the baseline agent, and a small-model smoke test. That is validation, not a benchmark. A public benchmark is planned, not run.
10. If you try it on your site, I want the false positives most. Open an issue with the check id and the report. Which task should it verify next: pricing lookup, docs search, add to cart up to the last safe step?

Notes: post 3 needs the `ambiguous-ui` terminal image from `docs/examples/terminal-output.txt`. Do not
add "Lighthouse for agents" anywhere. Reply to every question for the first day.
