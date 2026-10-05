# LinkedIn

Draft, to be rewritten in the maintainer's voice. One post, one image (terminal output of the
`ambiguous-ui` fixture, labelled as a fixture). No tagging of companies or people unless they asked.

---

AI agents are starting to browse the web on behalf of people. Whether they can finish a simple job on your site (find your contact details, your privacy policy, your help page) is not something a standard accessibility or SEO check tells you.

I released Agentic Web Check, an open-source command-line tool that tests exactly that. It loads a site in a real headless browser, runs 43 deterministic checks on what an agent perceives, then lets an agent try read-only tasks. Each result is decided by assertions on the final page, not by the agent's own claim. It also flags agent-directed risks such as hidden instructions for AI systems and delete or buy buttons with no confirmation step.

In one of my test fixtures (deliberately broken), the page scores well on perception checks, yet all three tasks are blocked by a consent banner with no named close button. That is the gap I want people to be able to see on their own sites.

What it is not: a certification, a crawler, or a benchmark. It checks a start page and a few linked pages. Version 0.1.0 is early, some thresholds are documented defaults, and a public benchmark is planned but has not been run.

MIT licensed, no telemetry, no API key needed for the default mode.
Repository: https://github.com/ericovirgy/agentic-web-check

If you run it on your own site, I would like to hear which results look wrong.

---

Post time: weekday morning in the maintainer's main audience time zone. Reply to comments personally.
