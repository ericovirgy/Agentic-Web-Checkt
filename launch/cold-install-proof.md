# Cold install proof (2026-10-05)

Environment: Linux container, Node 22, npm 10.9.4, fresh npm cache, no prior Playwright browser for the version the package pulls in. Package: `agentic-web-check@0.1.0` from the npm registry via `npx -y`.

| Step | Command | Result | Time |
|---|---|---|---|
| 1 | `npx -y agentic-web-check scan https://example.com` before installing a browser | Exit 2. Playwright's own message: executable does not exist, run `npx playwright install` | 3.6 s |
| 2 | `npx playwright install chromium` | Headless shell downloaded (114.3 MiB) | 11.7 s |
| 3 | `npx -y agentic-web-check scan https://example.com` | Exit 0. 43 checks, Agent Readiness 82/100 (deterministic) | 6.1 s |
| 4 | `npx -y agentic-web-check scan https://example.com --tasks default` | Exit 0. 67/100; contact FAIL, legal-policy FAIL, help-or-about PASS (baseline agent) | 10.1 s |

Friction found:
- A cold run without a browser fails with the generic Playwright message, which suggests `npx playwright install` (all browsers) rather than `npx playwright install chromium`. The README now shows the Chromium-only command above the first scan (`README.md` line 14, branch `launch/prep`).
- The tool does not print its own hint for this case. Candidate improvement for the next real release: catch the launch error and print the exact command and the `--browser-path` alternative. Not done: it needs a code change and a release.
- The example.com result with tasks (67) matches the value in `docs/validation/real-world-2026-10-05.md`.

Not tested: macOS, Windows, Node 20, corporate proxies.
