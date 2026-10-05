# Product discoverability loop

scan, score, evidence, fix, rescan, badge or report, share.

| Step | Exists today | Gap | Smallest addition (no architecture change) |
|---|---|---|---|
| Scan | `scan`, `test`, `ci` | Cold start needs Chromium | One-line install hint in the README first block; an error message that prints the install command |
| Score | Overall plus dimensions | | None |
| Evidence | Failed checks with observed vs expected, per-task steps and screenshots | | None |
| Fix | "Suggested fixes" per failed check | No copy-pasteable fix prompt | Optional: `report --md` already renders fixes; document how to paste them into a coding agent |
| Rescan | Re-run; `report` re-renders `results.json` | No built-in diff between two runs | Candidate feature: `report --compare old.json new.json` (new work, scope separately) |
| Badge or report | `--badge` SVG, `--html`, `--md` | No hosted URL to link | Keep local-first. Document committing `badge.svg` to a repo |
| Share | Output files | No "share your result" path | Discussions category "Show your score" with a template asking for methodology version and `summary.md` |

Missing features, in order of value for discoverability (candidates only, none started):
1. Result diff between two scans (supports the fix, rescan, share step).
2. Lighthouse adapter attaching the Agentic Browsing audits (already on the roadmap).
3. MCP server exposing the scanner (already on the roadmap).
4. More task archetypes: pricing lookup, docs lookup.

None of these should ship before launch.
