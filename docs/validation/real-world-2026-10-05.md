# Real-world validation run: 2026-10-05

Release validation, not a benchmark. No aggregate statistic from this run is to be published.

Source: GitHub Actions workflow `Validation (manual)`, run 37267818598 (commit 5d2c109, job 111628239512), GitHub-hosted
`ubuntu-latest` runner, Playwright Chromium, baseline agent, 3 pages per site, 45 s navigation timeout, default read-only
task archetypes. Dataset: `benchmark/datasets/real-world-validation.json` (16 public sites). Raw results are in the run's
`real-world-validation` artifact (30-day retention); this file was transcribed from the job log.

Caveats: sites change daily; these are single runs; task verdicts come from the deterministic baseline agent (a floor, not a
vendor agent); the archetype URL criteria of this run accepted any URL containing the keyword (tightened to path segments in
the commit after this run, see Observations).

| Site | Category | Overall | Pages (status) | contact | legal-policy | help-or-about | Failed checks |
|---|---|---:|---|---|---|---|---|
| books-toscrape | ecommerce-demo | 69 | books.toscrape.com/ [200] / books.toscrape.com/catalogue/category/books/self-h / books.toscrape.com/index.html [200] | FAIL | FAIL | PASS | console-errors, landmarks, sitemap, target-size, structured-data |
| docs-github | docs | 89 | docs.github.com/en [200] / docs.github.com/en/search-github [200] / docs.github.com/en/copilot/get-started/plans [200] | PASS | PASS | PASS | console-errors, ambiguous-control-names, label-in-name, hover-only-menus, sitemap, target-size, structured-data |
| example-com | static | 67 | example.com/ [200] | FAIL | FAIL | PASS | landmarks, key-pages-discoverable, sitemap, server-rendered-content, structured-data |
| github | saas | 56 | github.com/ [200] / github.com/pricing [200] / github.com/about [200] | BLOCKED | BLOCKED | BLOCKED | fake-interactive-elements, ambiguous-control-names, hover-only-menus, sitemap, overlay-interference, structured-data |
| gov-uk | public-institution | 96 | www.gov.uk/ [200] / www.gov.uk/search/research-and-statistics [200] / www.gov.uk/help [200] | PASS | PASS | PASS | none |
| mdn | docs | 81 | developer.mozilla.org/en-US/ [200] / developer.mozilla.org/en-US/about [200] / accounts.firefox.com/authorization?response_type=c | FAIL | PASS | PASS | ambiguous-control-names, hover-only-menus, target-size, structured-data |
| npmjs | developer-tooling | 84 | www.npmjs.com/ [200] / www.npmjs.com/products [200] / www.npmjs.com/about [403] | BLOCKED | PASS | PASS | sitemap, structured-data |
| playwright-dev | docs | 74 | playwright.dev/ [200] / playwright.dev/docs/intro [200] / playwright.dev/docs/api/class-playwright [200] | FAIL | FAIL | PASS | ambiguous-control-names, label-in-name, hover-only-menus |
| pypi | developer-tooling | 74 | pypi.org/ [200] / pypi.org/help/ [200] / pypi.org/organizations/ [200] | FAIL | FAIL | PASS | console-errors, ambiguous-control-names, hover-only-menus, target-size, structured-data |
| quotes-toscrape | static | 62 | quotes.toscrape.com/ [200] / quotes.toscrape.com/author/Albert-Einstein/ [200] / quotes.toscrape.com/author/J-K-Rowling/ [200] | FAIL | FAIL | FAIL | ambiguous-control-names, landmarks, sitemap, structured-data |
| react-dev | docs-spa | 67 | react.dev/ [200] / react.dev/community/docs-contributors [200] / react.dev/versions [200] | FAIL | FAIL | PASS | ambiguous-control-names, hover-only-menus, sitemap, form-fields-labelled, cross-origin-iframe-controls, structured-data |
| saucedemo | ecommerce-demo | 55 | www.saucedemo.com/ [200] | FAIL | FAIL | FAIL | key-pages-discoverable, sitemap, structured-data, forms-safe-transport |
| vercel-store | ecommerce-spa | 88 | demo.vercel.store/ [200] / demo.vercel.store/about [200] / demo.vercel.store/terms-conditions [200] | FAIL | PASS | PASS | structured-data |
| w3-org | public-institution | 90 | www.w3.org/ [200] / www.w3.org/help/search/ [200] / www.w3.org/about/ [200] | PASS | PASS | PASS | ambiguous-control-names, hover-only-menus, sitemap, structured-data |
| wikipedia | reference | 85 | en.wikipedia.org/wiki/Main_Page [200] / en.wikipedia.org/wiki/Wikipedia:About_Today's_feat / en.wikipedia.org/wiki/Wikipedia:Help_desk [200] | PASS | PASS | PASS | control-accessible-name, ambiguous-control-names, snapshot-budget, target-size, forms-safe-transport |

Totals (verdicts over 48 tasks): see the workflow summary; counts are intentionally not reproduced here as an aggregate.

## Observations

- **npmjs.com**: the browser loaded the page (HTTP 200) but a plain HTTP fetch with the tool's user agent hit a Cloudflare challenge; `/about` answered 403. The `challenge-or-bot-wall` check reports this as a warning with both observations.
- **github.com**: all three tasks were BLOCKED by `overlay-interference` on a fixed hero element covering 38% of the viewport with no dismiss control. Inspection showed it was a decorative fixed block, not a dialog: a false positive. Fixed after this run by requiring the element to intercept pointer events at 3 of 5 viewport sample points (`document.elementFromPoint`). Also observed: 108 clickable elements without a control role (28%), 60 navigation links hidden until hover, sitemap request answered 406.
- **bbc.com**: `help-or-about` passed by clicking an article whose URL contained the word "about"; the archetype URL criteria were tightened to path segments after this run. `robots-agent-access` reported four user-triggered agent tokens disallowed (ChatGPT-User, OAI-SearchBot, PerplexityBot, Perplexity-User). 11 controls inside cross-origin iframes (subscription widget).
- **saucedemo.com**: login wall on the start page, no footer links; all three read-only tasks FAIL (no matching control), overall 55. Expected for a test site that is a single login form.
- **example.com**: single page, no navigation; overall 67 reflects missing sitemap, structured data and navigation.
- **books.toscrape.com**: mixed-content jQuery from http:// fails to load (6 console errors), no landmarks, 141 undersized targets; the scraping sandbox is deliberately old-fashioned.
- **docs sites** (MDN, docs.github.com, playwright.dev, react.dev): high perception scores; contact tasks FAIL where the site has no contact page (playwright.dev, react.dev), which is the right verdict for the goal, not a defect of the site.
- **Public institutions** (gov.uk 96, w3.org 90) and **wikipedia** (85) passed all three tasks in one step each.
- No crash, no INCONCLUSIVE verdict, no check error in the 16 scans.

## Real-model smoke task (same workflow, run 37266821107, job 111625298622)

Provider: OpenAI-compatible endpoint (Ollama 0.x on the runner, CPU only). Model: `qwen2.5:3b`. Site: fixture `excellent` served on the runner. Tasks: the three default archetypes. Total elapsed 498 s.

| Task | Verdict | Steps | Time | What happened |
|---|---|---:|---:|---|
| contact | PASS | 2 | 130.7 s | clicked a list item, then `finish` with answer `hello@northwind.example`; the programmatic assertions (navigated, contact URL/heading) held |
| legal-policy | FAIL | 1 | 251.1 s | clicked "Privacy policy" (criteria held on the final page) but never called `finish` within the step budget; verdict FAIL by rule, not by the model's claim |
| help-or-about | BLOCKED | 2 | 109.1 s | the model clicked "Checkout"; the consequential-action guard stopped the task (`consequential-step`) |

This is one run of one small model and proves the pipeline (real model, real browser agent, real site, programmatic verdict); it says nothing about model quality in general.

## Second run after the fixes (run 37268708357, commit ad6fc89)

Same dataset, same settings, after the overlay hit-test fix, the path-segment URL criteria and the off-origin
redirect exclusion. All 16 sites completed again, no crash, no INCONCLUSIVE.

| Site | Overall (run 1 → run 2) | Tasks run 2 (contact / legal-policy / help-or-about) | Change |
|---|---|---|---|
| github | 56 → 89 | PASS / PASS / PASS | fixed hero no longer counted as a blocking overlay; tasks now run |
| react-dev | 67 → 58 | FAIL / FAIL / FAIL | help-or-about no longer passes on a slug containing "docs" via an article link; stricter criteria |
| bbc | 84 → 84 | PASS / PASS / PASS | unchanged |
| mdn | 81 → 84 | FAIL / PASS / PASS | the accounts.firefox.com redirect is now excluded from checks |
| gov-uk | 96 → 95 | PASS / PASS / PASS | one `dom-stability` warning on this run (site content changes between runs) |
| quotes-toscrape | 62 → 64 | FAIL / FAIL / FAIL | unchanged verdicts |
| others | within 0 to 2 points | unchanged | books 69, docs-github 89, example 67, npmjs 84, playwright 74, pypi 74, saucedemo 55, vercel-store 88, w3 90, wikipedia 87 |

### Real-model smoke task, second run (job 111630918476)

`qwen2.5:3b` on the runner CPU again, fixture `excellent`, default tasks, 465 s total, 31 provider calls,
94,927 input tokens, 1,016 output tokens (from the run's `results.json` usage fields).

| Task | Verdict | Steps | Time | What happened |
|---|---|---:|---:|---|
| contact | BLOCKED | 4 | 147.0 s | navigated to the contact page (criteria already held), then clicked "Send us a message" (contact-form submit); the read-only safety class stops at a form submission named with "send" |
| legal-policy | PASS | 2 | 41.7 s | clicked "Privacy policy", called `finish` with the page URL as the answer; assertions held |
| help-or-about | FAIL | 4 | 272.5 s | after one navigation the model kept clicking refs from the previous snapshot (stale refs, each click timing out after 8 s) and never called `finish` |

The two runs differ in which task passed: that is the expected non-determinism of a small model, and the reason
the verdict is computed from the page state rather than from the model. Both runs prove the pipeline end to end.
