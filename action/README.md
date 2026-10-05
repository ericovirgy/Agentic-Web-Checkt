# Agentic Web Check · GitHub Action

Runs [agentic-web-check](https://github.com/ericovirgy/agentic-web-check) inside your GitHub
runner: scans a URL, scores how usable the site is for AI agents, optionally verifies real tasks
with a browser agent, writes a job summary, posts a sticky pull request comment, uploads the
report as an artifact and fails the job when your thresholds are not met.

It is a composite action: no Docker image, no hosted service. Node 22 and a Playwright Chromium are
set up on the runner, the CLI is installed from npm and executed there.

## Minimal usage

```yaml
- uses: ericovirgy/agentic-web-check/action@v0
  with:
    url: https://example.com
```

## Thresholds, tasks and a PR comment

```yaml
name: Agent readiness

on:
  pull_request:

permissions:
  contents: read
  pull-requests: write # only needed for the sticky PR comment

jobs:
  agentic-web-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # Deploy a preview or start your app here, then point `url` at it.

      - uses: ericovirgy/agentic-web-check/action@v0
        id: awc
        with:
          url: https://preview.example.com
          pages: 5
          tasks: default            # or a path such as .github/awc-tasks.yaml
          fail-under: 70
          fail-on-task-fail: true
          fail-on: control-accessible-name,overlay-interference:warn

      - run: echo "score=${{ steps.awc.outputs.score }} passed=${{ steps.awc.outputs.passed }}"
        if: always()
```

The job summary shows the same markdown that is posted to the pull request: the overall score, a
per-dimension table, failures and warnings sorted by weight, behavioural task verdicts and the
suggested fixes. `report.html`, `results.json`, `summary.md` and `badge.svg` are uploaded as the
`agentic-web-check` artifact.

### LLM-driven tasks

The default `baseline` agent needs no API key. To run tasks with an LLM-driven agent:

```yaml
- uses: ericovirgy/agentic-web-check/action@v0
  with:
    url: https://preview.example.com
    tasks: .github/awc-tasks.yaml
    agent: llm
    llm-provider: openai        # or anthropic
    llm-model: gpt-5-mini
    llm-api-key: ${{ secrets.AWC_LLM_API_KEY }}
```

## Inputs

| Input | Default | Description |
|---|---|---|
| `url` | required | URL to scan (start page; same-origin pages are discovered from it). |
| `pages` | `3` | Number of same-origin pages to scan (start page + linked pages). |
| `tasks` | `''` | Behavioural tasks: empty for none, `default` for the built-in archetypes, or a path to a tasks YAML file (relative to the workspace). |
| `agent` | `baseline` | Task agent: `baseline` (no LLM) or `llm`. |
| `fail-under` | `0` | Fail the job when the overall score is below this value (0-100). |
| `fail-on-task-fail` | `false` | Fail the job when any behavioural task is `FAIL` or `BLOCKED`. |
| `fail-on` | `''` | Comma-separated check ids that fail the job when they fail; append `:warn` to a check id to also fail on warnings. |
| `timeout` | `30000` | Navigation timeout in milliseconds. |
| `allow-forms` | `false` | Allow tasks marked `safety: form-submit` to submit POST forms with synthetic data. |
| `version` | `latest` | npm version or dist-tag of `agentic-web-check` to run, or `local` to build and run the checked-out repository (used by this repository's own CI). |
| `comment` | `true` | Post or update a sticky pull request comment on `pull_request` events (`pull_request_target` is deliberately not supported: it would run repository code from a fork with a write token). |
| `summary` | `true` | Append the markdown summary to the job summary. |
| `artifact` | `true` | Upload the results directory as a workflow artifact. |
| `artifact-name` | `agentic-web-check` | Name of the uploaded artifact. |
| `output-dir` | `awc-results` | Directory (relative to the workspace) that receives `results.json`, `report.html`, `summary.md`, `badge.svg` and screenshots. |
| `llm-api-key` | `''` | API key for the LLM provider, passed to the CLI as `AWC_LLM_API_KEY`. Only used with `agent: llm`. |
| `llm-provider` | `''` | `openai` (any OpenAI-compatible endpoint) or `anthropic`. Passed as `AWC_LLM_PROVIDER`. |
| `llm-model` | `''` | LLM model id. Passed as `AWC_LLM_MODEL`. |
| `github-token` | `${{ github.token }}` | Token used to post the pull request comment. |

## Outputs

| Output | Description |
|---|---|
| `score` | Overall score (0-100). Empty when the scan did not produce results. |
| `mode` | `deterministic` (no tasks) or `behavioural` (tasks were run and blended into the score). |
| `results-path` | Absolute path to `results.json` (stable, versioned schema). |
| `report-path` | Absolute path to the single-file HTML report. |
| `badge-path` | Absolute path to the SVG badge. |
| `passed` | `true` when the scan ran and every threshold was met, otherwise `false`. |

Outputs are set even when the job fails, so a later step with `if: always()` can use them.

## Exit codes and job status

The action mirrors the CLI's exit codes:

| Code | Meaning | Job |
|---|---|---|
| 0 | scan ran, all thresholds met | passes |
| 1 | scan ran, at least one threshold not met (`fail-under`, `fail-on-task-fail`, `fail-on`) | fails with "thresholds not met" |
| 2 | runtime error (unreachable URL, browser failure, invalid tasks file, ...) | fails with "runtime error" |

The summary, the PR comment and the artifact are produced before the job is failed, so a failed
scan still leaves the evidence behind.

## Permissions

| Permission | Needed for |
|---|---|
| `contents: read` | checking out the repository (`actions/checkout`) |
| `pull-requests: write` | the sticky PR comment (`comment: true` on `pull_request` events) |

Without `pull-requests: write` the comment step logs a warning and the rest of the action still
runs. Pull requests from forks receive a read-only `GITHUB_TOKEN`; set `comment: false` for them or
run the scan on `pull_request_target` with care.

## Privacy

Everything runs inside the runner. No data leaves it except:

- HTTP requests to the target site (honest user agent `AgenticWebCheck/<version>`, robots.txt
  respected for crawling additional pages, synthetic form data only, no destructive actions);
- requests to the LLM provider you configured, only when `agent: llm` is enabled;
- the usual GitHub API calls for the job summary, the artifact upload and the PR comment.

There is no telemetry.

## Versioning

Use the floating major tag (`@v0` while the project is pre-1.0, `@v1` from 1.0.0 on) to receive
compatible updates, or pin an exact release tag (`@v0.1.0`) or commit SHA. Each release:

1. publishes `agentic-web-check@<version>` to npm with provenance;
2. creates a GitHub release from the matching `CHANGELOG.md` section;
3. force-moves the major tag (`v0`, later `v1`) to the release commit, so it always points at the latest
   `1.x` release (pre-releases such as `v1.3.0-beta.1` do not move it).

The action installs the CLI version given by the `version` input (`latest` by default), so the
scanner you run is decoupled from the action tag; pin `version` for fully reproducible runs.

## Running the CLI directly

If you prefer plain steps:

```yaml
- run: npx agentic-web-check@latest ci https://example.com --fail-under 70 --tasks default --out awc-results
```

See the main README and `docs/SCORING.md` for the methodology.
