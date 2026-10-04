# Launch checklist for v0.1.0

Ordered. Each step names the file or setting it touches. Items marked **blocker** were found while
preparing these drafts and must be resolved before anything is posted.

## 0. Repository state (blockers found on 2026-10-04)

- [ ] **Blocker: untracked files.** `git status` shows `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`,
      `CODE_OF_CONDUCT.md`, `SECURITY.md`, `docs/BEHAVIOURAL-TESTING.md`, `examples/`, `tests/`,
      `.github/ISSUE_TEMPLATE/` and `.github/PULL_REQUEST_TEMPLATE.md` as untracked. Commit them
      before tagging; the release workflow runs `pnpm test` and the issue templates must be on `main`.
- [ ] **Blocker: repository name.** The git remote is `ericovirgy/Agentic-Web-Checkt`; every URL in
      `README.md`, `package.json`, `action/README.md`, `action/action.yml`, `CHANGELOG.md` and the issue
      template config says `ericovirgy/agentic-web-check`. Either rename the GitHub repository to
      `agentic-web-check` (GitHub redirects the old name) or change every URL. Rename is simpler.
- [ ] **Blocker: major tag for the action.** `release.yml` computes the major tag as
      `v${version%%.*}`, which for `0.1.0` is `v0`, but `action/README.md`, the main README and the
      self-check examples all say `@v1`. Pick one: (a) document `@v0` until 1.0.0, or (b) after the
      release, create `v1` manually at the release commit (`git tag -f v1 <sha> && git push -f origin
      v1`) and accept that the workflow will not keep it moving until 1.x. Option (a) is honest about
      pre-1.0 status; option (b) keeps the docs as written. Decide and make the docs match.
- [ ] **Blocker: missing file referenced from README.** `README.md` links
      `docs/SECURITY-MODEL.md`, which does not exist. Write it or point the link at `SECURITY.md`.
- [ ] **Example data referenced by these drafts.** `docs/examples/results-pypi-org.json` is cited by
      the blog post and LinkedIn notes but is not in the repository; the scan output is at
      `/tmp/claude-0/real/pypi_org_/results.json` on the machine that ran it. Copy it into
      `docs/examples/` (and optionally `summary.md`), and add a short note in `docs/examples/` that the
      console-errors finding is partly an artefact of a sandbox proxy blocking analytics scripts.
- [ ] Create the labels the issue templates set: `bug`, `check-accuracy`, `new-check`.
- [ ] Confirm `agentic-web-check` is free on npm (`npm view agentic-web-check` should 404) and that the
      publishing account has 2FA with an automation token.

## 1. Release

- [ ] Add the `NPM_TOKEN` secret (Settings, Secrets and variables, Actions). The workflow publishes
      with `--provenance`, so the token must be an automation token and the repository must be public.
- [ ] `CHANGELOG.md` has the `## [0.1.0] - 2026-10-04` section the workflow extracts; adjust the date
      if the tag is pushed on another day.
- [ ] Run locally once more: `pnpm lint && pnpm typecheck && pnpm test && pnpm build && npm pack --dry-run`.
- [ ] Push `main`, wait for the CI workflow (`ci.yml`) to pass, including the **self-check** job that
      runs the action with `version: local` against the `excellent` fixture and asserts score >= 70 and
      `mode = behavioural`.
- [ ] Tag and push: `git tag v0.1.0 && git push origin v0.1.0`. The release workflow checks the tag
      against `package.json`, tests, builds, packs, publishes to npm, creates the GitHub release from
      the changelog section and moves the major tag.
- [ ] Verify: `npx agentic-web-check@0.1.0 --version` on a clean machine; the GitHub release exists
      with the `.tgz` attached; the major tag is where you decided in step 0.
- [ ] Optionally replace the generated release body with `docs/launch/release-notes-v0.1.0.md`.
- [ ] Run the action from the published package once (a throwaway workflow with
      `uses: ericovirgy/agentic-web-check/action@<tag>` and `url: https://example.com`) to confirm
      the `latest` dist-tag resolves.

## 2. Repository settings

- [ ] Enable Discussions and create the categories in `docs/launch/github-repo-metadata.md`
      (Announcements, Ideas, Show your score, Q&A, Benchmark). The issue template config already
      links to `/discussions`.
- [ ] Set the description, topics and social preview from `docs/launch/github-repo-metadata.md`.
- [ ] Verify the README badges render: npm version (only after publish), CI (workflow file `ci.yml`
      on `main`), license.
- [ ] Enable "Private vulnerability reporting" so the `security/advisories/new` link in the issue
      template config works.
- [ ] Pin the Announcements post for v0.1.0.

## 3. Content pass before posting

- [ ] Re-verify every FACT\* statistic you intend to quote (WebVoyager 44.4%, Online-Mind2Web 51%,
      Web Bench 46.6%, WebArena 54.9%) against the primary paper. docs/research/04 marks them as
      snippet-sourced. If a number cannot be confirmed, drop it rather than round it.
- [ ] Read the competitive statements once more against docs/research/03-competitive-matrix.md. Only
      FACT-tagged descriptions of Lighthouse, Cloudflare, Vercel and the open-source scanners may be
      used. Do not characterise a project's internals from its README claims.
- [ ] Check every draft for the pypi.org rules: illustration not judgement, maintainers not contacted,
      console-errors finding is partly an artefact, LinkedIn does not name the site.
- [ ] Grep the drafts for em-dashes and for "best", "first", "only", "fastest"; the launch style is
      direct and without superlatives that cannot be backed. ("Nobody open-source executes real tasks"
      is a research finding dated 2026-10-04 in docs/SPEC.md; if you use it, date it.)
- [ ] Replace `[REPO_LINK]` in `x-thread.md`. Count characters again after any edit (280 limit).

## 4. Post order and timing

Suggested, one channel per day so you can answer questions in each:

| Day | Channel | File | Notes |
|---|---|---|---|
| D0 (Tue to Thu, morning US Eastern) | GitHub release + Discussions Announcement | `release-notes-v0.1.0.md` | Everything else links here. |
| D0, within the hour | Hacker News, Show HN | `hacker-news.md` | Post the first comment immediately. Stay for two hours. |
| D0, after HN is live | X thread | `x-thread.md` | Link the HN thread in a reply, not in the thread. |
| D1 | r/webdev | `reddit.md` | Text post. Read the subreddit's self-promotion rule first. |
| D2 | r/LocalLLaMA | `reddit.md` | Different angle (local models, no API key). Not the same text as r/webdev. |
| D3 | LinkedIn | `linkedin.md` | Professional audience, the unnamed real-site illustration. |
| D3 to D7 | Blog post | `blog-post.md` | Publish once the first round of false-positive reports has been triaged, and update the post if a check changed. |

Do not cross-post on the same day. Do not post to Product Hunt or newsletters before the
false-positive reports from HN have been triaged.

## 5. What to monitor for the first two weeks

- Issues with the `check-accuracy` label: triage within 24 hours (see section 6).
- `npm view agentic-web-check` downloads and the GitHub traffic page: for your own information, not for
  posting.
- The action's `latest` resolution: a report that `@v1` or `@v0` does not resolve is a release
  problem, not a user problem.
- Chromium install problems (`npx playwright install chromium`, `--browser-path`, corporate proxies and
  `--insecure`): answer in Q&A and add to the README's Install section if the same question appears
  twice.
- Any post that quotes a real-site score: reply with the methodology version, the date and the caveat
  that scores are snapshots.
- Sites whose owners object to being scanned in a public post: apologise, remove the mention, and do
  not argue. The tool uses an honest user agent and read-only tasks, but a public score is still a
  public statement about someone else's site.

## 6. Responding to false-positive reports

The template `.github/ISSUE_TEMPLATE/false_positive.yml` asks for: check id, kind (false positive,
false negative, wrong severity), URL or fixture, version and methodology, observed summary and
evidence lines, expected status with reference to the detection rule in `docs/SCORING.md`, the check's
JSON object from `results.json`, and a minimal HTML reproduction.

1. Thank the reporter and confirm the version. If the report lacks the evidence JSON, ask for it
   with a link to the template section; do not guess from the summary line.
2. Reproduce with the minimal HTML as a new fixture page (or a new fixture site under
   `fixtures/sites/`), declaring the expected status in `fixture.json`. If it cannot be reproduced,
   ask for the `results.json` and the exact command.
3. Decide which side is wrong: the check or the fixture expectation. The benchmark harness compares
   fixture expectations with observed status but never decides; a human does.
4. Fix the detection, keep the fixture, add a `CHANGELOG.md` entry under `Unreleased`. If a threshold
   or weight changes, that is a **methodology bump**: say so in the changelog under **Changed**, bump
   the methodology version, and note that earlier scores are no longer comparable.
5. If the report is really a disagreement with the check's existence or weight, move it to a
   Discussion in Ideas, as the template says, and explain the admission rule from `CONTRIBUTING.md`.
6. Never label a report "works as intended" without quoting the detection rule from `docs/SCORING.md`
   that produced the status.

## 7. Do not

- **No fake engagement.** No upvote requests, no vote rings, no alt accounts, no asking friends to
  comment on HN or Reddit. Both communities detect and penalise it, and it is dishonest.
- **No fabricated or extrapolated benchmark numbers.** No "agents fail on X% of sites", no mean
  score for the web, no leaderboard. A number is quoted only from a run directory produced by
  `benchmark/run.ts`, committed under `benchmark/results/`, and cited with dataset name and version,
  tool version, methodology version and date (`benchmark/README.md`, "Publishing results").
- **No claims of sites tested beyond what `benchmark/results/` contains.** Today that is the
  `dev-fixtures` dataset (eight local fixture sites) and nothing else. The `public-sample` dataset is a
  candidate list; it has not been executed. The single pypi.org scan is an illustration, not a
  benchmark, and is never counted as "sites tested".
- No negative framing of any real site. pypi.org appears as an illustration with its caveats stated,
  and its maintainers were not contacted.
- No "safe" or "secure" wording about a scanned site. The SAFETY dimension answers whether a site
  gives an agent what it needs to act safely; the badge never says "safe".
- No comparison scores against other tools' scores; the scales are incomparable and the README says
  so.
- No statements about Lighthouse, Cloudflare, Vercel or any open-source scanner beyond what is tagged
  FACT in `docs/research/03-competitive-matrix.md`.
- No telemetry, analytics or tracking added to the HTML report, the badge or the action as part of the
  launch.
