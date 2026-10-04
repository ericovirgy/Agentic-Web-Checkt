# X thread (6 posts, each 280 characters or fewer)

Draft for maintainer review. Replace `[REPO_LINK]` with https://github.com/ericovirgy/agentic-web-check
before posting (the placeholder is shorter than the final URL; both fit).

---

**1/6**

Can an AI agent actually use your website?

Not "do you have an llms.txt". Can it find your contact page, get past your cookie banner, tell your three "Submit" buttons apart?

We built an open-source tool to measure exactly that. Thread.

**2/6**

Agentic Web Check loads your site in headless Chromium and takes the same accessibility snapshot that Playwright MCP and Chrome DevTools MCP hand to agents.

43 checks across 6 dimensions: perception, navigation, interaction, machine interfaces, reliability, safety.

**3/6**

Then it runs tasks. An agent drives the browser; the verdict comes from assertions on the final page state (URL, text, element present), never from the agent claiming it finished.

PASS, FAIL, BLOCKED or INCONCLUSIVE, with a step log and screenshots.

**4/6**

No API key needed. The baseline agent is deterministic: it reads the accessibility tree and follows controls by name. If it finishes, your site is easy. If not, the log shows which gap stopped it.

An LLM agent is optional: any OpenAI-compatible endpoint (Ollama works) or Anthropic.

**5/6**

Lighthouse now has an Agentic Browsing category. We do not duplicate it.

We add what it does not cover: behavioural verdicts, and a safety review for site owners (hidden text aimed at AI systems, delete or buy buttons with no confirmation step).

Local-first. No telemetry. No hosted service.

**6/6**

v0.1.0, MIT, methodology v1.

Try it:
npx agentic-web-check scan https://your-site --tasks default

GitHub Action and badge included. The public benchmark is not run yet, so no real-site numbers; false-positive reports are welcome.

[REPO_LINK]
