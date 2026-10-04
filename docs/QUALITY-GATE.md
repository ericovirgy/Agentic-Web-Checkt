# Quality gate record: v0.1.0 (2026-10-04)

Executed in the development container (Node v22.22.0, pnpm 10.28.0, Chromium 141.0.7390.37 via
`AWC_BROWSER_PATH`, Playwright 1.63.0). Commands and observed results, copied from the terminal.

| Step | Command | Result |
|---|---|---|
| Format | `npx biome format .` | Checked 54 files, no fixes applied |
| Lint | `npx biome check .` | Checked 54 files, 0 errors, 1 info |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Unit tests | `pnpm test:unit` | 9 files, 198 tests passed, 1.6 s |
| Integration tests (browser) | `pnpm test:integration` | 4 files, 190 tests passed, 154 s |
| Build | `pnpm build` (tsup) | ESM + DTS build success |
| Package | `npm pack --dry-run` | 324.9 kB packed, 1.3 MB unpacked, 9 files |
| Installed package smoke | `npm i ./agentic-web-check-0.1.0.tgz` in a temp project, `npx agentic-web-check ci <fixture> --tasks default --fail-under 70` | exit 0, score 98, artifacts written (results.json, report.html, summary.md, badge.svg, screenshots/) |
| CLI smoke | `node dist/cli.js --version`, `node dist/cli.js checks` | 0.1.0, 43 checks listed |
| GitHub Action validation | YAML parse of `action/action.yml`, `ci.yml`, `release.yml`; `bash -n` on run blocks; `read-results.mjs` against example results; exit-code chain dry run | all passed (performed by the action author, see action/README.md); not yet executed on a real GitHub runner |
| Fixture expectations | `tests/integration/fixtures.test.ts` | every `expect` check status and task verdict of the 8 fixture sites matches |
| Benchmark (dev dataset) | `pnpm bench --dataset benchmark/datasets/dev-fixtures.json` | 8/8 entries completed; see benchmark/README.md for the aggregation rules |
| Real-world scan | `agentic-web-check scan https://pypi.org/ --tasks default --insecure` | 71/100, 3 pages, tasks 1 PASS / 2 FAIL; saved as docs/examples/results-pypi-org.json |

Known gaps in this record:

- The GitHub Action and the release workflow have not run on github.com yet (no CI run on the branch at the
  time of writing).
- The public benchmark dataset (`benchmark/datasets/public-sample.json`) has not been executed; the sandbox
  egress proxy blocks most public hosts.
- The LLM agent was validated only against scripted mock providers (OpenAI-compatible and Anthropic wire
  formats), not against live models.
