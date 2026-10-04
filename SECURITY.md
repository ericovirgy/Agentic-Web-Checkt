# Security policy

## Supported versions

| Version | Supported |
|---|---|
| 0.1.x | yes |
| earlier | no |

Only the latest published minor receives fixes. Pre-releases (`-beta`, `-rc`) are not supported.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting: open the repository's **Security** tab and choose
**Report a vulnerability** (https://github.com/ericovirgy/agentic-web-check/security/advisories/new).
Do not open a public issue for a security problem.

Include the version (`agentic-web-check --version`), the command you ran, the target (a fixture
under `fixtures/sites/` if you can reproduce it there), and what happened. You should get an
acknowledgement within a week. Fixes are published as a patch release with a CHANGELOG entry; you
will be credited unless you ask not to be.

## Scope

In scope: the scanner itself and everything it ships (`src/`, `dist/`, the GitHub Action under
`action/`, the benchmark harness, the fixture server). Examples of things we want to hear about:

- a page that can make the scanner execute code outside the browser sandbox, read files, or make
  network requests to hosts other than the target site and the configured LLM provider;
- a way for page content to escape the task runner's safety guards (same-origin navigation,
  form-submit and consequential-action opt-ins);
- API keys or other secrets leaking into reports, logs or artifacts;
- path traversal in the fixture server or in `--out` handling.

Out of scope: the tool is **not a security scanner for target sites**. Its SAFETY dimension reports
whether a site gives an agent what it needs to act safely (hidden instructions, unguarded
consequential actions, unlabelled login boundaries, secret-looking tokens in page source). A pass
is not a statement that the site is secure, and a finding about a third-party site is not a
vulnerability in this project. Report those to the site owner.

## Responsible use

- Deterministic scans (no `--tasks`) load a handful of pages with an honest user agent
  (`AgenticWebCheck/<version>`), the same as any browser visit. Use judgement on sites that
  prohibit automated access.
- Behavioural tasks drive a browser against the site. Only run them against sites you own or have
  permission to test. `--allow-forms` submits forms and `--allow-consequential` performs actions
  such as purchases or deletions; never enable them against a site that is not yours, and never
  put real personal data in a tasks file.
- The benchmark's public dataset only lists sites that are built for or known to tolerate
  automated access. Keep it that way when proposing entries.
