import { isCountedTask } from '../scoring/index.js';
import type { ScanResult } from '../types.js';

/**
 * Badge wording reflects exactly what was tested:
 *   "Agent Ready · scan 84/100"            deterministic scan only
 *   "Agent Ready · verified 84/100"        behavioural tasks were run AND at least one counted
 *                                          towards TASK SUCCESS (N = counted tasks)
 * A behavioural run whose tasks were all INCONCLUSIVE (or all excluded) verified nothing, so it is
 * labelled "scan". The badge never implies the site is "safe"; the methodology version is embedded.
 */
export function badgeLabel(result: ScanResult): { label: string; message: string; color: string } {
  const score = result.overall;
  const counted = result.tasks.filter(isCountedTask).length;
  const label =
    result.meta.mode === 'behavioural' && counted > 0
      ? `Agent Ready · verified (${counted} task${counted === 1 ? '' : 's'})`
      : 'Agent Ready · scan';
  const message = score === null ? 'n/a' : `${score}/100 · v${result.meta.methodology}`;
  const color =
    score === null
      ? '#9f9f9f'
      : score >= 90
        ? '#2e7d32'
        : score >= 70
          ? '#558b2f'
          : score >= 50
            ? '#f9a825'
            : '#c62828';
  return { label, message, color };
}

function textWidth(s: string): number {
  // Approximation for DejaVu Sans 11px used by shields-style badges.
  return Math.round(s.length * 6.3 + 10);
}

export function renderBadgeSvg(result: ScanResult): string {
  const { label, message, color } = badgeLabel(result);
  const lw = textWidth(label);
  const mw = textWidth(message);
  const w = lw + mw;
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${esc(label)}: ${esc(message)}">
  <title>${esc(label)}: ${esc(message)} (agentic-web-check ${esc(result.meta.version)}, ${esc(result.meta.finishedAt.slice(0, 10))})</title>
  <linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
  <clipPath id="r"><rect width="${w}" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)"><rect width="${lw}" height="20" fill="#555"/><rect x="${lw}" width="${mw}" height="20" fill="${color}"/><rect width="${w}" height="20" fill="url(#s)"/></g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="${lw / 2}" y="14" fill="#010101" fill-opacity=".3">${esc(label)}</text><text x="${lw / 2}" y="13">${esc(label)}</text>
    <text x="${lw + mw / 2}" y="14" fill="#010101" fill-opacity=".3">${esc(message)}</text><text x="${lw + mw / 2}" y="13">${esc(message)}</text>
  </g>
</svg>
`;
}
