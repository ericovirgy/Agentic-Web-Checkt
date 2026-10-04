# Hacker News (Show HN)

Draft for maintainer review. Nothing here is posted automatically.

## Title options (all under 80 characters)

1. `Show HN: Agentic Web Check – Lighthouse for AI agents (open source, local-first)`
2. `Show HN: Can an AI agent use your website? A CLI that runs tasks and scores it`
3. `Show HN: Agentic Web Check, a browser-based agent-readiness audit with task verdicts`

URL: https://github.com/ericovirgy/agentic-web-check

## First comment (maintainer's voice, about 250 words)

Maintainer here. Agentic Web Check is an MIT-licensed CLI: `npx agentic-web-check scan <url> --tasks default`. It loads the site in headless Chromium, takes the same accessibility snapshot that Playwright MCP hands to agents, runs 43 checks across six dimensions, and then runs three read-only tasks (find contact details, find the privacy policy or terms, find the help or about page) with a browser agent. Verdicts come from assertions on the final browser state (URL, text, element present), never from the agent saying it finished.

Why not just Lighthouse? Lighthouse 13 ships an official Agentic Browsing category, and it is the right baseline for "can agents read this". We do not re-implement its audits and we did not want to add another fetch-and-parse checklist scanner; our research found more than fifteen of those. What we add: checks at the level of what an agent perceives in a live browser (unnamed controls, overlays without a named dismiss button, hover-only menus, closed shadow roots), task verification with programmatic verdicts, a safety review for site owners (hidden text addressed to AI systems, delete or buy buttons with no confirmation step), and a deterministic baseline agent that needs no API key. An LLM agent is optional, over any OpenAI-compatible endpoint or the Anthropic API.

Limitations: Chromium only. Start page plus a few linked pages, not a crawl. Several thresholds (snapshot size, overlay coverage, hover detection) are defensible defaults, not validated constants, and are labelled as such in docs/SCORING.md. The baseline agent is a floor, not a vendor agent. The public benchmark has not been run, so there are no real-site numbers. No telemetry, no hosted service.

Feedback wanted: false positives (there is an issue template that asks for the evidence JSON), which task archetypes you would want next, and whether the dimension weights make sense to you.

## Notes for the maintainer

- Post from the account that owns the repository; HN readers check.
- Reply to every substantive comment in the first two hours. Concede valid points quickly.
- If someone asks for real-site numbers, the answer is: the public-sample dataset exists but has not been executed; numbers come only from a committed benchmark run (benchmark/README.md, "Publishing results").
- If someone names a competing tool, acknowledge it accurately. docs/research/03-competitive-matrix.md has FACT-tagged descriptions; do not characterise a project beyond what is tagged FACT there.
