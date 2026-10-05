# Community plan

Principle: show up where the audience already is, follow each community's current rules, give
before asking, never post identical text twice.

| Community | Rule that matters (verify live) | Plan |
|---|---|---|
| Hacker News | Show HN must be tryable without sign-up, human-written, no vote requests | `launch/hn.md`. One post, owner present |
| Reddit | Per-subreddit rules, karma and promotion ratios (mirror data only) | `launch/reddit.md`. Start with r/javascript and r/opensource; modmail r/LLMDevs first |
| DEV | `#showdev` is for projects; disclose AI use | `launch/devto.md` |
| Lobsters | Invite-only; self-promotion under about a quarter of activity (secondary source) | Skip for now. No invite requests just to promote |
| WebMCP community | Substantive contributions require joining the W3C Community Group; third-party issues are accepted | Read issues #227 and #242; comment only with a concrete gap about annotation detection. No announcement |
| Lighthouse | A "Agentic Web Audits" Discussions category exists and was empty on 2026-10-05; the stated criteria favour audits without third-party APIs | One question-style Discussion post (see tracker) |
| Playwright community | Official Discord and Stack Overflow; project PRs without a linked issue are closed | Do not contact. Cite the API reference (`class-locator`) for `ariaSnapshot({ mode: 'ai' })`, not the aria-snapshots guide |
| Accessibility | WebAIM list discontinued (2025); other venues not found | Only with a genuine accessibility article; Accessibility Weekly rejects tool promotion without it |
| AI-agent communities | r/AI_Agents weekly thread; others not verified | Comment in the weekly thread |

## Maintainer habits (after launch)

- Triage within 24 hours; label `check-accuracy` for false positives; thank reporters.
- Turn every accepted false positive into a fixture or a threshold note, then record it in CHANGELOG.
- Publish a "what changed after launch feedback" post only with real feedback.
- Keep a visible "good first issue" list: new fixtures, new task archetypes, docs.

## Hard limits

No fake accounts, no vote or star trading, no mass DMs, no pitching communities that prohibit tools,
no arguing with moderators, no identical cross-posts.
