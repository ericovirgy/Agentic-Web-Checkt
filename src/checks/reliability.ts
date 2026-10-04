import { CHALLENGE_MARKERS } from '../browser/page-data.js';
import type { EvidenceItem } from '../types.js';
import { type CheckDefinition, okPages, pagesOf } from './framework.js';

export function detectChallenge(
  status: number | null,
  title: string,
  bodyMarkers: string[],
  rawBody?: string,
): string[] {
  const hits = new Set<string>(bodyMarkers);
  const t = title.toLowerCase();
  if (/just a moment|attention required|access denied|verify you are human|are you a robot/.test(t))
    hits.add(`title: ${title}`);
  if (rawBody) {
    const low = rawBody.toLowerCase();
    for (const m of CHALLENGE_MARKERS) if (low.includes(m)) hits.add(m);
  }
  if ((status === 403 || status === 429 || status === 503) && hits.size === 0)
    hits.add(`HTTP ${status}`);
  return [...hits];
}

export const reliabilityChecks: CheckDefinition[] = [
  {
    id: 'page-load',
    title: 'Page loads successfully',
    dimension: 'reliability',
    weight: 10,
    rationale:
      'Prerequisite for everything else: a 2xx response and a load event within the budget.',
    references: ['HTTP semantics (RFC 9110)'],
    remediation: 'Fix the HTTP error or slow load; make the page reach load within the timeout.',
    run(ctx) {
      const p = ctx.start;
      if (p.error)
        return {
          status: 'fail',
          summary: `Navigation failed: ${p.error}`,
          evidence: [{ url: p.url, observed: p.error, expected: 'successful navigation' }],
          metrics: { loadMs: p.loadMs },
        };
      const ok = p.status !== null && p.status < 400;
      const slow = p.loadMs > 10_000;
      return {
        status: !ok ? 'fail' : slow ? 'warn' : 'pass',
        summary: `HTTP ${p.status} in ${p.loadMs} ms.`,
        evidence: [
          {
            url: p.finalUrl,
            observed: `HTTP ${p.status}, load ${p.loadMs} ms`,
            expected: '2xx within 10 s',
          },
        ],
        metrics: { status: p.status ?? -1, loadMs: p.loadMs },
        pages: [p.finalUrl],
      };
    },
  },
  {
    id: 'challenge-or-bot-wall',
    title: 'No bot challenge blocks automated browsers',
    dimension: 'reliability',
    weight: 10,
    rationale:
      'Access errors, CAPTCHAs and loading failures are the largest failure class for agents on live sites (Online-Mind2Web: 51%). A challenge page is a hard stop for every agent.',
    references: [
      'WCAG 2.2 SC 3.3.8 Accessible Authentication',
      'Online-Mind2Web error analysis',
      'Web Bot Auth drafts (research/02 §14)',
    ],
    remediation:
      'Exempt well-behaved agents (honest UA, Web Bot Auth signatures) from challenges on public pages, or serve a machine-readable alternative.',
    run(ctx) {
      const p = ctx.start;
      const raw = ctx.probes.rawHtml;
      const browserHits = p.error
        ? []
        : detectChallenge(p.status, p.data.title, p.data.challengeMarkers);
      const fetchHits = detectChallenge(raw.status, '', [], raw.body);
      const evidence: EvidenceItem[] = [
        {
          url: p.finalUrl || p.url,
          observed: browserHits.length
            ? `browser: ${browserHits.join(', ')}`
            : `browser: HTTP ${p.status ?? 'error'}, no challenge markers`,
          expected: 'page content',
        },
        {
          url: raw.url,
          observed: fetchHits.length
            ? `plain fetch: ${fetchHits.join(', ')}`
            : `plain fetch: HTTP ${raw.status ?? raw.error}`,
          expected: 'same content as the browser',
          note: "UA-parity probe with the tool's own user agent",
        },
      ];
      if (p.error && fetchHits.length === 0)
        return {
          status: 'na',
          summary: 'Start page did not load; no challenge markers in the plain fetch either.',
          evidence,
        };
      const status =
        browserHits.length || (p.error && fetchHits.length)
          ? 'fail'
          : fetchHits.length
            ? 'warn'
            : 'pass';
      return {
        status,
        summary: browserHits.length
          ? 'The browser hit a bot challenge or access denial.'
          : p.error && fetchHits.length
            ? 'The browser could not load the page and a plain HTTP fetch was challenged or denied.'
            : fetchHits.length
              ? 'The browser loaded the page but a plain HTTP fetch was challenged or denied.'
              : 'No bot challenge detected.',
        evidence,
        metrics: { browserChallenge: browserHits.length > 0, fetchChallenge: fetchHits.length > 0 },
        pages: [p.finalUrl],
      };
    },
  },
  {
    id: 'dom-stability',
    title: 'The DOM settles after load',
    dimension: 'reliability',
    weight: 7,
    rationale:
      'Agents act on a snapshot; if the DOM keeps mutating or shifting, refs go stale and clicks land on moved elements (documented for Playwright MCP and agent-browser).',
    references: [
      'Playwright MCP stale-ref semantics',
      'Lighthouse cumulative-layout-shift in Agentic Browsing',
      'INFERENCE thresholds: 50/300 mutations in 2 s, CLS 0.1/0.25',
    ],
    remediation:
      'Finish rendering before load, avoid late-inserted banners/ads, reserve space for async content, stop polling updates when idle.',
    run(ctx) {
      const evidence: EvidenceItem[] = [];
      let worstMut = 0;
      let worstCls = 0;
      for (const p of okPages(ctx)) {
        worstMut = Math.max(worstMut, p.data.mutationsAfterSettle);
        worstCls = Math.max(worstCls, p.data.cls);
        evidence.push({
          url: p.finalUrl,
          observed: `${p.data.mutationsAfterSettle} mutations in the 2 s after settle, CLS ${p.data.cls}`,
          expected: '< 50 mutations, CLS < 0.1',
        });
      }
      if (okPages(ctx).length === 0) return { status: 'na', summary: 'No page loaded.' };
      const status =
        worstMut >= 300 || worstCls >= 0.25
          ? 'fail'
          : worstMut >= 50 || worstCls >= 0.1
            ? 'warn'
            : 'pass';
      return {
        status,
        summary: `Worst page: ${worstMut} late mutations, CLS ${worstCls}.`,
        evidence,
        metrics: { maxLateMutations: worstMut, maxCls: worstCls },
        pages: pagesOf(ctx),
      };
    },
  },
  {
    id: 'network-settles',
    title: 'Network activity settles',
    dimension: 'reliability',
    weight: 3,
    rationale:
      'Agent harnesses wait for network idle; pages that never go idle (polling, SSE, WebSockets) hang or time out those waits.',
    references: [
      'agent-browser README: networkidle hangs on SSE/WebSockets',
      'Playwright waitForLoadState("networkidle")',
    ],
    remediation:
      'Defer long-polling/streaming connections until after first interaction, or keep them off the initial load.',
    run(ctx) {
      const evidence: EvidenceItem[] = okPages(ctx).map((p) => ({
        url: p.finalUrl,
        observed: p.networkIdle ? 'network idle reached' : 'network idle not reached within 10 s',
        expected: 'idle within 10 s',
      }));
      const notIdle = okPages(ctx).filter((p) => !p.networkIdle).length;
      if (okPages(ctx).length === 0) return { status: 'na', summary: 'No page loaded.' };
      return {
        status: notIdle === 0 ? 'pass' : 'warn',
        summary:
          notIdle === 0
            ? 'Network idle reached on all pages.'
            : `${notIdle} pages never reached network idle.`,
        evidence,
        metrics: { pagesNotIdle: notIdle },
        pages: pagesOf(ctx),
      };
    },
  },
  {
    id: 'console-errors',
    title: 'No runtime errors during load',
    dimension: 'reliability',
    weight: 3,
    rationale:
      'Uncaught exceptions and failed script loads correlate with controls that do nothing when activated (INFERENCE).',
    references: ['Lighthouse errors-in-console'],
    remediation: 'Fix uncaught exceptions and failed script requests reported during load.',
    run(ctx) {
      const evidence: EvidenceItem[] = [];
      let errors = 0;
      for (const p of okPages(ctx)) {
        const n = p.consoleErrors.length + p.failedScripts.length;
        errors += n;
        for (const e of p.consoleErrors.slice(0, 5))
          evidence.push({
            url: p.finalUrl,
            observed: e.slice(0, 160),
            expected: 'no uncaught errors',
          });
        for (const s of p.failedScripts.slice(0, 3))
          evidence.push({
            url: p.finalUrl,
            observed: `script failed to load: ${s}`,
            expected: 'all scripts load',
          });
      }
      if (okPages(ctx).length === 0) return { status: 'na', summary: 'No page loaded.' };
      return {
        status: errors === 0 ? 'pass' : errors <= 2 ? 'warn' : 'fail',
        summary:
          errors === 0 ? 'No runtime errors.' : `${errors} runtime errors or failed scripts.`,
        evidence: evidence.slice(0, 20),
        metrics: { errors },
        pages: pagesOf(ctx),
      };
    },
  },
];
