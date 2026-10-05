# DEV article

Rules (https://dev.to/code-of-conduct, https://dev.to/t/showdev, read via a summarising fetcher):
disclose AI assistance and cite sources; `#showdev` is for projects, not tutorials or salesy content;
`/guidelines` and `/guidelines/ai` returned 404, so the full AI policy was not read. Re-check before posting.

Tags: `showdev`, `ai`, `webdev`, `accessibility` (max four).

## Title

I built a CLI that checks whether an AI agent can finish a task on your website

## Outline (maintainer to write in their own voice, 800 to 1200 words)

1. The question: sites can be easy to read for machines and still hard to operate. Show the
   `ambiguous-ui` fixture: perception 81, three tasks BLOCKED by a consent overlay without a named
   dismiss control. State plainly that it is a deliberately broken fixture.
2. What gets measured: snapshot (`page.ariaSnapshot({ mode: 'ai' })`), 43 checks, six dimensions.
3. How a verdict is decided: assertions on final browser state, four verdicts, the safety classes.
4. Try it: the two commands, `--out` for HTML and JSON, a custom `tasks.yaml` snippet from `examples/tasks.yaml`.
5. Safety review: what it flags, what it does not claim ("the badge never says safe").
6. What validation exists: 16 public sites with a baseline agent on 2026-10-05, explicitly not a
   benchmark; a small-model smoke test with two different outcomes across two runs (non-determinism is
   the reason the verdict comes from page state).
7. Limits and what is next (benchmark planned, not run; Lighthouse adapter and MCP server on roadmap).
8. Call for help: false positives, fixtures, task archetypes.
9. AI disclosure line, if any AI assistance was used for the text or the code.

## Do not

Do not claim "Lighthouse for agents", benchmark results, adoption, or provenance. Do not paste the
README. Link the repo once near the top and once at the end.
