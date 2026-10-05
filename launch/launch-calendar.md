# 14-day calendar

Proposed T0: Wednesday 2026-10-14 (weekday, after Node Weekly returns from its break on 2026-10-08,
and after three prep days). Shift all dates together if T0 moves. Every public action is gated by
the owner's approval in the local, unversioned `launch/private/submission-tracker.md`.

Channel order follows tiers, not a fixed "HN first" assumption:

- Tier 1: WebMCP list, Console.dev, Web Tools Weekly, Changelog News, relevant awesome lists.
- Tier 2: Lighthouse Discussion, DEV, Playwright and browser-agent communities, Reddit communities that allow project posts.
- Tier 3: Hacker News (WAITING until the account is verified as eligible), Product Hunt, remaining directories.

| Day | Date | Actions | Gate |
|---|---|---|---|
| T-3 | Sun 2026-10-11 | Asset freeze: GitHub About (description, topics), labels, Discussions, social preview (done where marked in `launch/strategy.md`). Re-run CI. Record a 30 to 45 s screen capture of the one-command run on a clean machine/container | Owner applies Settings changes |
| T-2 | Mon 2026-10-12 | Private technical review: ask one or two trusted people to run `npx agentic-web-check scan` cold and report friction (Chromium install, Node version). Fix docs only. Re-read curator and community rules | Owner picks reviewers |
| T-1 | Tue 2026-10-13 | Curator submissions prepared as drafts: Console.dev email, Changelog News form, Web Tools Weekly DM, awesome-list PR texts. Open the exact pages. Check CI is green | None, prepare only |
| T0 | Wed 2026-10-14 | Tier 1 wave 1: send Console.dev email; open the awesome-webmcp PR. Owner stays online for replies | Approve each send |
| T+1 | Thu 2026-10-15 | Tier 1 wave 2: Web Tools Weekly DM; Changelog News form (needs sign-in). Reply to issue feedback | Approve each send |
| T+2 | Fri 2026-10-16 | Lighthouse "Agentic Web Audits" Discussion (questions, complementary framing, not promotion). Optional WebMCP comment only if a concrete gap exists | Approve each |
| T+3 | Sat 2026-10-17 | DEV #showdev article (human-written, AI use disclosed). r/webdev Showoff Saturday post if the account has history | Approve |
| T+4 | Sun 2026-10-18 | Awesome-list PRs, one per list, hand-written: awesome-playwright, awesome-testing | Approve each PR |
| T+5 | Mon 2026-10-19 | More PRs: awesome-web-agents (disclose authorship), awesome-browser-automation. r/javascript post. 3 to 5 creator notes, each with a specific reason | Approve each |
| T+6 | Tue 2026-10-20 | Benchmark story only if an executed, frozen run exists (status PLANNED today). Otherwise publish a "what I learned from the first feedback" note | Approve |
| T+7 | Wed 2026-10-21 | One-week review: metrics log, triage issues, patch false positives on a branch. Decide whether Show HN is eligible and worthwhile (Tier 3, status WAITING until then) | Approve if posted |
| T+8 to T+10 | 2026-10-22 to 24 | One follow-up per unanswered target at most, after 7 days of silence. Reply to every issue | Approve each |
| T+11 to T+14 | 2026-10-25 to 28 | Decide next version scope from issues; consider awesome-cli-apps after the 3-month and 20-star conditions (about 2027-01-05); retrospective | None |

Rules: no second wave if the first wave produced mostly negative signal about correctness; fix
first. Never schedule two community posts for the same hour. One follow-up per target, ever, unless
they reply.
