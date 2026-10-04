# GitHub repository metadata

Draft for maintainer review. Apply under Settings, About (description, topics, social preview) and
Settings, Features (Discussions).

## Description (under 350 characters)

> Lighthouse for AI agents. Scan a website in headless Chromium, measure how usable it is for AI agents (43 checks, 6 dimensions), run real tasks with a browser agent and get programmatic verdicts plus a safety review for site owners. Local-first CLI and GitHub Action, no API key required, no telemetry. MIT.

Character count: 307.

Website field: leave empty until there is a docs site, or point at `docs/SCORING.md` on GitHub.

## Topics (20 maximum; these are 18)

```
ai-agents
agentic-web
agent-readiness
accessibility
accessibility-tree
playwright
lighthouse
axe-core
webmcp
llms-txt
web-audit
browser-agents
developer-tools
github-action
cli
typescript
benchmark
prompt-injection
```

Rationale: the first nine match `package.json` keywords and the npm listing so the two surfaces agree;
`accessibility-tree`, `browser-agents` and `prompt-injection` describe what the tool actually
inspects; `cli`, `typescript`, `github-action` are the discovery topics people filter by.

## Social preview

GitHub renders the image at 1280x640. Text to put on it (keep to three lines):

```
Agentic Web Check
Can an AI agent actually use your website?
43 checks · task verdicts · safety review · no API key
```

Alt text for the image: "Agentic Web Check: terminal report showing an Agent Readiness score, six dimension scores and behavioural task verdicts."

If a screenshot is used instead of typeset text, use the terminal output in
`docs/examples/terminal-output.txt` (the `ambiguous-ui` fixture, 58/100), not the real-site scan.

## Discussions categories

Enable Discussions before launch; the false-positive issue template already tells people to open a
Discussion for disagreements about a check's existence or weight.

| Category | Format | Purpose | Pinned first post |
|---|---|---|---|
| Announcements | Announcement (maintainers post, anyone replies) | Releases, methodology version bumps, benchmark publications. | The v0.1.0 release note with a link to `CHANGELOG.md`. |
| Ideas | Open discussion | New checks, task archetypes, weights. Link `CONTRIBUTING.md`'s admission rule (source, fixture, SCORING.md row) so proposals arrive with a reference. | "How a check gets admitted" (copy of the admission rule). |
| Show your score | Open discussion | People post their own site's report. Ask for the JSON and the methodology version; make clear that scores are only comparable within one methodology version. | "How to share a result: `--out`, attach `results.json` and `summary.md`, state the version." |
| Q&A | Question / answer | Setup problems (Chromium install, `--browser-path`, corporate proxies and `--insecure`), LLM provider configuration, reading the report. | "Common setup questions" linking the README's Install section. |
| Benchmark | Open discussion | The public-sample dataset: which sites to include, how to run it reproducibly, published runs. Reiterate: no numbers are quoted without a committed run directory. | "Benchmark rules" (summary of `benchmark/README.md`, "Publishing results"). |

Labels to create before launch (the issue templates reference them): `check-accuracy` (used by
`false_positive.yml`); check `bug_report.yml` and `new_check.yml` for the labels they set and create
those too.

## npm listing

The npm page shows `README.md` and the `package.json` description and keywords. Both are already in
the repository; verify after publishing that the README badges render (the npm version badge only
resolves once the package exists).
