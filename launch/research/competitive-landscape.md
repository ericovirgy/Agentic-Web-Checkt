# Competitive landscape (fetched 2026-10-05)

Method caveat: pages were read through a summarising fetcher, not raw HTML. Stars are indicative.
"n/s" = not stated. UNVERIFIED = not confirmed. Outreach reasons are judgement, not sourced fact.
Search was not exhaustive; "not found" never means "does not exist".

Columns: Static/Beh, Browser (real browser), Tasks (performs real tasks), Verif (success verified programmatically), Safety (has a safety layer).

| # | Project | URL | Measures | Static/Beh | Browser | Tasks | Verif | Safety | Popularity | Angle | Outreach |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Lighthouse "Agentic Browsing" (experimental) | https://developer.chrome.com/docs/lighthouse/agentic-browsing | WebMCP registration, agent accessibility, CLS, llms.txt; fractional score | Static | Chrome 150+, needs WebMCP origin trial | No | n/a | None listed | Lighthouse repo 30.7k stars, Apache-2.0 | Complement: behavioural and safety layer on top | Discussion only (see maintainer-pitch) |
| 2 | AgentReady standard | https://agentready.org | Requirements for Find, Read, Act; does not prescribe scoring | Spec | n/a | n/a | n/a | n/s | 15 stars, MIT; Ora and Vercel authors | Map checks to AR-* IDs (not done) | Issue/PR after mapping |
| 3 | Ora Deep Scan, is-agentic.com | https://ora.ai/blog/is-agentic-with-vercel | 110 checks in 5 layers using real agents; is-agentic 80/20/+5 scoring | Behavioural (per Ora) | UNVERIFIED | Yes | Not stated | n/s | Hosted service; open-source status not found | Competitor with data | No |
| 4 | WebMCP spec | https://github.com/webmachinelearning/webmcp | API to expose site functionality as tools; read-only, untrusted-content, consequential-action annotations | Spec | n/a | n/a | n/a | Security section | 3.5k stars | We audit annotation use | Comment only if a concrete gap |
| 5 | GoogleChromeLabs/webmcp-tools | https://github.com/GoogleChromeLabs/webmcp-tools | Inspector, Evals CLI, polyfill, demos | Mixed | Inspector in browser | Tool-call evals | UNVERIFIED | No | Star figures inconsistent (422, 477, 555) | Cross-link | Maybe |
| 6 | Chrome DevTools MCP | https://github.com/ChromeDevTools/chrome-devtools-mcp | Agent-driven DevTools incl. `lighthouse_audit` | Tooling | Yes | Agent-driven | No | No | 52.9k stars; usage statistics ON by default | Integration point | No |
| 7 | Playwright MCP | https://github.com/microsoft/playwright-mcp | Browser automation via accessibility snapshots | Tooling | Yes | Agent-driven | No | Filters; "not a security boundary" | 36.8k stars | Same snapshot idea | No |
| 8 | Playwright Test Agents | https://playwright.dev/docs/test-agents | Planner, Generator, Healer | Behavioural | Yes | Generates tests | Assertions in generated tests | No | n/a | Different goal | No |
| 9 | browser-use | https://github.com/browser-use/browser-use | Agent framework, benchmark v2 | Behavioural | Yes | Yes | Not verified | n/a | 116.7k stars, MIT | Possible LLM backend (UNVERIFIED) | No |
| 10 | Stagehand | https://github.com/browserbase/stagehand | Agent SDK, WebMCP support | Tooling | Yes | Yes | n/a | n/a | 25.5k stars, MIT | Same | No |
| 11 | vercel-labs/agent-browser | https://github.com/vercel-labs/agent-browser | Rust CLI, ref-based snapshots, axe-core `a11y` command | Tooling | Yes | Agent-driven | No | Agent-side only | 41.1k stars | Closest technical neighbour | No |
| 12 | BrowserGym | https://github.com/ServiceNow/BrowserGym | Unifies MiniWoB, WebArena, WorkArena and others | Behavioural | Yes | Yes | Per benchmark | No | 1.3k stars | Citation | No |
| 13 | AgentLab | https://github.com/ServiceNow/AgentLab | Framework and leaderboard on BrowserGym | Behavioural | Yes | Yes | Via BrowserGym | No | 633 stars; licence not confirmed | n/a | No |
| 14 | WebArena | https://github.com/web-arena-x/webarena | 812 tasks on self-hosted sites | Behavioural | Yes | Yes | Yes, programmatic | No | 1.6k stars | Cite evaluation design | No |
| 15 | VisualWebArena | https://github.com/web-arena-x/visualwebarena | 910 multimodal tasks | Behavioural | Yes | Yes | Execution-based | No | 483 stars | n/a | No |
| 16 | WorkArena | https://github.com/ServiceNow/WorkArena | ServiceNow enterprise tasks | Behavioural | Yes | Yes | Via AgentLab | No | 270 stars | n/a | No |
| 17 | Mind2Web | https://github.com/OSU-NLP-Group/Mind2Web | 2,000+ tasks, 137 sites, offline | Offline | No | Prediction only | Action matching | No | 1.0k stars | n/a | No |
| 18 | Online-Mind2Web | https://github.com/OSU-NLP-Group/Online-Mind2Web | 300 tasks on 136 live sites | Behavioural | Yes | Yes | No, LLM judge (WebJudge) | No | 200 stars | Precedent for live-site design | No |
| 19 | Cloudflare isitagentready | https://isitagentready.com | ~20 standards (robots, markdown negotiation, MCP cards, OAuth discovery) | Appears static | n/s | No | n/a | No | Proprietary | n/a | No |
| 20 to 24 | Small static scanners (forgemeshlabs/agent-readiness-mcp, api-evangelist/agent-ready-dev, matteobaccan/AgentReady, sspoisk/agent-readiness-cli, marsojuji-cmyk/agentready) | various GitHub/dev.to | 15 to 72 signals each | Static | No | No | n/a | No | 0 stars each where stated | Low | No |
| 25 | kinti/a11y-toolkit | https://pypi.org/project/a11y-toolkit/ | WCAG 2.2 MCP server and CLI | Mixed | Playwright | No | Audit rules | No | v5.2.0, MIT | WCAG-oriented | No |

## Supportable claims about this project

- Local, MIT, deterministic perception audit that needs no LLM and no API key; most scanners found (#20 to #24) are static HTTP checks; Lighthouse's category needs Chrome 150+ and an origin trial.
- Programmatic task assertions on live sites; the live-site benchmark checked (#18) uses an LLM judge; #14 uses programmatic evaluators on self-hosted sites.
- A site-side safety review; no site-safety audit was found in #1, #19 to #25 or the benchmarks (not found in what was checked).

## Not safe to claim

"First", "only", "unique"; "Lighthouse for AI agents"; any popularity, accuracy or "agents do better after fixes" claim; AgentReady compliance; that Ora or is-agentic do not run tasks in a real browser (UNVERIFIED either way).

## The gap

No open-source, local tool was found that, against an arbitrary live URL, runs scripted behavioural tasks in a real browser, decides success by programmatic assertions and adds a site-side safety review (hidden instructions, unguarded consequential actions, unsafe forms, WebMCP annotations). Each part exists elsewhere in isolation. Private, unlisted or unindexed tools cannot be ruled out.

## What others do better

Distribution (Lighthouse, DevTools MCP, Playwright MCP); standard-setting and public datasets (AgentReady: Vercel, Ora, Mintlify, Auth0); real vendor agents (Ora Deep Scan); protocol coverage (Cloudflare and others check OAuth discovery, MCP cards, commerce protocols; coverage of these in this project is unknown); peer-reviewed benchmarks with leaderboards; WebMCP-native tooling from Google.

## Data inconsistencies to reconcile before publishing

- AgentReady v1.0 date: Ora blog says 2026-04-24; agentready.org and the repo say August 2026. The README says "v1.0, August 2026". Check before repeating it.
- webmcp-tools star counts differ across three pages.
- Telemetry defaults for browser-use, Stagehand, agent-browser: not confirmed.
