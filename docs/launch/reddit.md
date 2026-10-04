# Reddit

Two drafts for maintainer review. Check each subreddit's self-promotion rules before posting; both
subreddits remove posts that read as advertising. Post as a text post, link the repo in the body.

---

## r/webdev

**Title:** I built an open-source tool that checks whether an AI agent can actually use your website (not just whether you have an llms.txt)

**Body:**

Most "agent readiness" scanners fetch your HTML and tick boxes: robots.txt, sitemap, llms.txt, JSON-LD. Useful, but none of them tells you whether an agent that lands on your page can dismiss the cookie banner, find the contact form, or tell your three "Submit" buttons apart.

Agentic Web Check (MIT, npm `agentic-web-check`) runs the page in headless Chromium through Playwright and looks at what agents actually receive.

How it works:

1. Perception audit. It takes the accessibility snapshot that Playwright MCP and Chrome DevTools MCP feed to agents, runs a selected set of axe-core rules, and evaluates 43 checks across six dimensions (perception, navigation, interaction, machine interfaces, reliability, safety). Every check cites a WCAG criterion, a Lighthouse audit, a spec, or a failure mode documented in an agent benchmark.
2. Task verification. A built-in agent tries three read-only tasks (find contact details, find privacy or terms, find help or about). The verdict comes from assertions on the final browser state, never from the agent claiming success.
3. Safety review. Hidden text addressed to AI systems, consequential buttons (delete, buy, send) with no confirmation step, forms posting over HTTP or cross-origin.

Output is a terminal report with suggested fixes, plus JSON, a single-file HTML report, markdown and an SVG badge. There is a GitHub Action with a sticky PR comment and thresholds.

```
npx agentic-web-check scan https://your-site.example --tasks default
```

No API key needed for the default agent. No telemetry, no hosted service. Lighthouse 13 has its own Agentic Browsing category; we do not duplicate it.

Honest caveats: Chromium only, a few pages rather than a full crawl, and the thresholds are documented defaults rather than validated constants. The public benchmark has not been run yet.

Question for you: which task would you want verified on your own site first? Contact form, pricing lookup, add to cart up to the last safe step, docs search? We are deciding the next archetypes.

Repo: https://github.com/ericovirgy/agentic-web-check

---

## r/LocalLLaMA

**Title:** Open-source website audit for AI agents: deterministic baseline needs no API key, LLM agent works with Ollama or any OpenAI-compatible endpoint

**Body:**

I have been working on Agentic Web Check, an MIT-licensed CLI that measures whether a website is usable by browser agents. Posting here because the LLM side was built for local models from the start.

How it works:

- The page loads in headless Chromium (Playwright). The tool takes the `ariaSnapshot({ mode: 'ai' })` accessibility tree, the same thing Playwright MCP hands to a model, and runs 43 deterministic checks on it: unnamed controls, fake buttons (div with onclick), overlays with no named dismiss control, hover-only menus, closed shadow roots, bot walls, hidden text aimed at AI systems, and so on.
- Then it runs tasks. Two agent backends share one tool surface (snapshot, click, type, select, press, navigate, scroll, back, finish):
  - `baseline`: no LLM at all. It reads the accessibility tree and follows controls whose names match the task's keyword set. If this agent can finish, the site is unambiguously navigable; if not, the step log shows which perception gap stopped it.
  - `llm`: a tool-calling loop over plain `fetch` against an OpenAI-compatible `chat/completions` endpoint (or the Anthropic Messages API). No SDK dependency.
- Verdicts are programmatic (URL, text, element assertions against the final page state). There is no LLM judge anywhere.

Local model example:

```
AWC_LLM_BASE_URL=http://localhost:11434/v1 AWC_LLM_MODEL=<your-model> \
  npx agentic-web-check test https://your-site.example --agent llm
```

Every run records steps, truncated snapshots before each action, screenshots and token usage, so you can compare models on the same site.

Caveats: we have not benchmarked local models systematically yet, LLM runs are non-deterministic (run several times), and the public benchmark dataset has not been executed.

Question: which local models have you found usable for tool-calling browser loops with 10k to 40k character snapshots? We would like to publish a model-by-model comparison on the fixture sites in the repo, and would rather start from what people actually run.

Repo: https://github.com/ericovirgy/agentic-web-check
