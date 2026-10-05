# Reddit

Two drafts for maintainer review. Check each subreddit's self-promotion rules before posting; both
remove posts that read as advertising. Post as a text post, link the repo in the body.

---

## r/webdev

**Title:** I built an open-source tool that checks whether an AI agent can actually use your website (not just whether you have an llms.txt)

**Body:**

Most "agent readiness" scanners fetch your HTML and tick boxes: robots.txt, sitemap, llms.txt, JSON-LD. None tells you whether an agent landing on your page can dismiss the cookie banner or tell your three "Submit" buttons apart.

Agentic Web Check (MIT, npm `agentic-web-check`) runs the page in headless Chromium and looks at what agents actually receive.

How it works:

1. Perception audit. It takes the AI-mode accessibility snapshot that Playwright's bundled MCP server captures (`page.ariaSnapshot({ mode: 'ai' })`), runs selected axe-core rules, and evaluates 43 checks across six dimensions. Each check cites a WCAG criterion, a Lighthouse audit, a spec or a documented agent failure mode.
2. Task verification. A built-in agent tries three read-only tasks (find contact, find privacy or terms, find help or about). The verdict comes from assertions on the final page state, never from the agent claiming success.
3. Safety review. Hidden text addressed to AI systems, delete/buy/send buttons with no confirmation step, forms posting over HTTP or cross-origin.

Output: terminal report with fixes, JSON, single-file HTML, markdown, SVG badge, and an experimental GitHub Action with a sticky PR comment.

```
npx agentic-web-check scan https://your-site.example --tasks default
```

No API key for the default agent, no telemetry, no hosted service. Lighthouse 13 has its own Agentic Browsing category; we do not duplicate it.

Caveats: Chromium only, a few pages rather than a crawl, thresholds are documented defaults, and the public benchmark has not been run (a release-validation run on 16 public sites exists, but it is not a benchmark and we publish no aggregate from it).

Question: which task would you want verified on your site first? Contact form, pricing lookup, add to cart up to the last safe step, docs search? We are choosing the next archetypes.

Repo: https://github.com/ericovirgy/agentic-web-check

---

## r/LocalLLaMA

**Title:** Open-source website audit for AI agents: deterministic baseline needs no API key, LLM agent works with Ollama or any OpenAI-compatible endpoint

**Body:**

Agentic Web Check is an MIT-licensed CLI that measures whether a website is usable by browser agents. The LLM side was built for local models from the start.

How it works:

- The page loads in headless Chromium. The tool takes the AI-mode accessibility snapshot (`page.ariaSnapshot({ mode: 'ai' })`) that Playwright's bundled MCP server captures, and runs 43 deterministic checks on it: unnamed controls, fake buttons, overlays with no named dismiss control, hover-only menus, hidden text aimed at AI systems.
- Then it runs tasks. Two agent backends share one tool surface (snapshot, click, type, select, press, navigate, scroll, back, finish). `baseline` uses no LLM: it follows controls whose accessible names match the task's keywords. `llm` is a tool-calling loop over plain `fetch` against an OpenAI-compatible `chat/completions` endpoint (or the Anthropic Messages API). No SDK dependency.
- Verdicts are programmatic assertions (URL, text, element) on the final page state. No LLM judge.

Local model example:

```
AWC_LLM_BASE_URL=http://localhost:11434/v1 AWC_LLM_MODEL=<your-model> \
  npx agentic-web-check test https://your-site.example --agent llm
```

Every run records steps, snapshots, screenshots and token usage, so models can be compared on the same site.

Caveats: we have not benchmarked local models systematically, LLM runs are non-deterministic, and the public benchmark dataset has not been executed. One data point, from a CI runner on CPU with Ollama `qwen2.5:3b` against our `excellent` fixture: contact PASS in 2 steps (130.7 s), legal-policy FAIL (step budget exhausted; the criteria held on the final page but the model never called `finish`), help-or-about BLOCKED (the model clicked "Checkout" and the consequential-action guard stopped it), 498 s for the three tasks. Details in docs/RELEASE-CANDIDATE.md.

Question: which local models have you found usable for tool-calling browser loops? Snapshots handed to the model are truncated to 24,000 characters. We want to publish a model comparison on the repo's fixture sites and would rather start from what people actually run.

Repo: https://github.com/ericovirgy/agentic-web-check
