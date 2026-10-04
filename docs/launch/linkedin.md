# LinkedIn

Draft for maintainer review. About 150 words. Plain text, no hashtags in the body; add two or three
at the end if you use them (suggested: #accessibility #aiagents #opensource).

---

Can an AI agent use your website? Not read it: use it. Find the contact page, get past the cookie banner, tell one "Submit" button from another.

I have released Agentic Web Check, an open-source CLI (MIT) that answers that question with evidence. It loads a site in headless Chromium, takes the same accessibility snapshot that agent harnesses such as Playwright MCP use, runs 43 checks across six dimensions, and then runs real tasks with a browser agent. Verdicts are computed from the final page state, never from the agent's own claim of success.

One illustration: a large public site we scanned scored 71/100. The deterministic agent found the help page in one step but could not find contact details, because no link on the start page carried a contact-like name. The report also flagged navigation links hidden until hover and nine link names pointing to different destinations. Fixable things, and invisible to a checklist scanner.

No API key required, no telemetry, GitHub Action included.

https://github.com/ericovirgy/agentic-web-check

---

## Notes for the maintainer

- The illustration is the pypi.org scan of 2026-10-04 (docs/examples/results-pypi-org.json). The post
  does not name the site; keep it that way. The maintainers of that site were not contacted and the
  scan is a snapshot of one day, so it should not read as a judgement of the site.
- Do not quote the console-errors finding from that scan: the sandbox's egress proxy blocked
  analytics scripts, so it is partly an artefact of the environment.
- The hover-only-menus heuristic is marked INFERENCE in docs/SCORING.md; "flagged" is the right verb.
