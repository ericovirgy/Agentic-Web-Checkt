# Reddit

All subreddit rules below came from third-party mirrors (reddit.com blocked the research fetcher),
so none is confirmed from a primary source. Open each subreddit's real sidebar and rules before
posting. Never post the same text in two places. The account must have genuine history; if it does
not, comment usefully for a few weeks first, or skip Reddit.

## Ranked communities

| Priority | Community | What the mirror showed | Format | Fit |
|---|---|---|---|---|
| 1 | r/javascript | Projects accepted if they have source, write-up or demo; not pure self-promotion | Link post to repo with a short technical description | 4 |
| 2 | r/opensource | Under 10 percent own content; project posts carry a "Promotional" flair; account history expected | Text post, flair as required | 4 |
| 3 | r/AI_Agents | Weekly "Project Display" threads | Comment in the weekly thread | 4 |
| 4 | r/LLMDevs | Ask moderators via modmail before posting a tool; two violations give a permanent ban | Modmail first | 3 |
| 5 | r/webdev | Projects only on Saturdays (Showoff Saturday flair); 9:1 rule | Saturday post | 3 |
| 6 | r/node | Projects allowed if they add value | Text post | 3 |
| 7 | r/ClaudeAI | "Built with Claude" megathread; age and karma thresholds unknown | Only if framed as tested with Claude agents, and only if that is true | 3 |
| Skip | r/LocalLLaMA | Needs karma thresholds; LLM-generated text not allowed; tool only fits if it works with local models | The smoke test used `qwen2.5:3b` through Ollama on a CI runner, one data point only | 2 |
| Skip | r/MachineLearning, r/programming, r/typescript, r/accessibility | Rules not found | Do not post | n/a |

## Variant A: r/javascript and r/node (technical)

Title: Open-source CLI that runs tasks in headless Chromium to check whether an AI agent can use a site

Body outline (write it yourself, 150 to 250 words):
1. What it is and the one command.
2. How it works: AI-mode aria snapshot, 43 deterministic checks, assertion-based task verdicts.
3. What the baseline agent is and is not.
4. Limits: Chromium only, few pages, thresholds are defaults, no benchmark yet.
5. Question: which task should be verified first on your site?
6. Repo link.

## Variant B: r/opensource (project and governance)

Title: Open-source tool for testing AI-agent usability of websites, looking for contributors on checks and tasks

Outline: MIT, no telemetry, how a new check is admitted (`CONTRIBUTING.md`: source, fixture, SCORING.md row),
issue templates for false positives, what help is wanted (new fixtures, false-positive reports,
task archetypes).

## Variant C: r/AI_Agents weekly thread comment

Two sentences and a link: what it does, and the question "what would you want an agent to complete on your own site?"

## Variant D: r/webdev (Saturday)

Frame it for site owners: "Where does an AI agent get stuck on your site?" with the cookie-wall fixture output and a link.

## Rules for replies

Answer comments the same day. Do not argue with removal. If a moderator says no, stop.
