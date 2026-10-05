# Hacker News: Show HN

Rules read on 2026-10-05 (https://news.ycombinator.com/showhn.html, newsguidelines.html, via a
summarising fetcher, so re-read both pages before posting): the project must be something others
can try, usable without a sign-up, ready before posting; blog posts and landing pages are
off-topic for Show HN; do not ask anyone to upvote or comment; do not post generated or AI-edited
text. This file is a fact sheet and outline. The post and the first comment must be rewritten by
the maintainer in their own words.

## Title options (pick one, no site name, no exclamation marks, no caps)

1. Show HN: A CLI that tests whether an AI agent can use your website
2. Show HN: Agentic Web Check, run real tasks against a site and see where an agent gets stuck
3. Show HN: Open-source check for sites that look agent-ready but block agents

Recommended: 1. URL: https://github.com/ericovirgy/agentic-web-check

## Facts for the first comment (all verified in the repo)

- `npx agentic-web-check scan <url> --tasks default` (first run needs `npx playwright install chromium`).
- Headless Chromium via Playwright; takes `page.ariaSnapshot({ mode: 'ai' })`; 43 deterministic checks.
- Tasks: contact details, privacy or terms, help or about. Verdict from assertions on final page state.
- Baseline agent needs no key; optional LLM agent over OpenAI-compatible or Anthropic endpoints.
- Safety review: hidden text addressed to AI systems, unguarded consequential actions, forms over HTTP.
- No telemetry. Read-only tasks by default; forms and consequential actions are opt-in flags.
- Demo to show: the `ambiguous-ui` fixture: perception 81, task success 0, because a consent overlay
  has no named dismiss control. It is a deliberately broken fixture.

## Limitations to state in the comment

- Chromium only; a few pages, not a crawl.
- Some thresholds are documented defaults, not validated constants.
- The baseline agent is a floor, not a vendor agent.
- A public benchmark is planned and has not been run; the 2026-10-05 runs on 16 public sites are
  validation, and no aggregate is published.
- The GitHub Action is experimental and has only run in this repository.
- Version 0.1.0, one maintainer.

## One question to ask the readers

Which task would you want verified on your own site first (contact form, pricing lookup, docs
search, add to cart up to the last safe step)? Ask it because the answer picks the next archetypes.

## Day-of rules

- Post once. Do not delete and repost. Do not ask friends to vote.
- Be available for several hours; answer every substantive comment, concede valid points.
- If asked for numbers: say the benchmark has not been run, point to the validation file, quote no mean score.
- If asked "isn't this just Lighthouse?": Lighthouse's Agentic Browsing category reads the page; this
  runs tasks and reviews safety in a live browser; they are complementary.
- Never say "first" or "only".
- A brand-new or low-karma account is not formally blocked, but votes from such accounts may be
  discounted (secondary source, unverified). An account with real comment history helps. Do not create a new account for this.
