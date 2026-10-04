import type { AxeResults, Result as AxeRuleResult } from 'axe-core';
import type { PageData } from '../browser/page-data.js';
import type { SiteProbes } from '../browser/probes.js';
import type { LoadedPage } from '../browser/session.js';
import type {
  CheckResult,
  CheckStatus,
  CheckWeight,
  Dimension,
  EvidenceItem,
  ScanOptions,
} from '../types.js';

export interface CheckContext {
  options: ScanOptions;
  pages: LoadedPage[];
  /** The start page (always pages[0]). */
  start: LoadedPage;
  probes: SiteProbes;
  userAgent: string;
  log: (m: string) => void;
}

export interface CheckOutcome {
  status: CheckStatus;
  summary: string;
  evidence?: EvidenceItem[];
  metrics?: Record<string, number | string | boolean | undefined>;
  remediation?: string;
  pages?: string[];
}

export interface CheckDefinition {
  id: string;
  title: string;
  dimension: Dimension;
  weight: CheckWeight;
  rationale: string;
  references: string[];
  remediation: string;
  run(ctx: CheckContext): Promise<CheckOutcome> | CheckOutcome;
}

export const SCORE: Record<CheckStatus, number | undefined> = {
  pass: 1,
  warn: 0.5,
  fail: 0,
  na: undefined,
  info: undefined,
};

export function finalize(def: CheckDefinition, out: CheckOutcome, durationMs: number): CheckResult {
  return {
    id: def.id,
    title: def.title,
    dimension: def.dimension,
    weight: def.weight,
    status: out.status,
    score: SCORE[out.status],
    summary: out.summary,
    rationale: def.rationale,
    references: def.references,
    remediation: out.remediation ?? def.remediation,
    evidence: (out.evidence ?? []).slice(0, 25),
    metrics: out.metrics
      ? (Object.fromEntries(
          Object.entries(out.metrics).filter(([, v]) => v !== undefined),
        ) as Record<string, number | string | boolean>)
      : undefined,
    pages: out.pages,
    durationMs,
  };
}

export function failedResult(
  def: CheckDefinition,
  error: unknown,
  durationMs: number,
): CheckResult {
  return {
    ...finalize(
      def,
      { status: 'na', summary: 'Check crashed; excluded from scoring.' },
      durationMs,
    ),
    error: String((error as Error)?.message ?? error).slice(0, 300),
  };
}

export async function runChecks(
  defs: CheckDefinition[],
  ctx: CheckContext,
): Promise<CheckResult[]> {
  const only = ctx.options.onlyChecks;
  const results: CheckResult[] = [];
  for (const def of defs) {
    if (only?.length && !only.includes(def.id)) continue;
    const t = Date.now();
    // Gate: when the start page did not load, only the load/challenge checks are meaningful.
    if (ctx.start.error && def.id !== 'page-load' && def.id !== 'challenge-or-bot-wall') {
      results.push(
        finalize(
          def,
          { status: 'na', summary: `Not evaluated: start page did not load (${ctx.start.error}).` },
          0,
        ),
      );
      continue;
    }
    try {
      const out = await def.run(ctx);
      results.push(finalize(def, out, Date.now() - t));
    } catch (e) {
      ctx.log(`check ${def.id} crashed: ${String(e)}`);
      results.push(failedResult(def, e, Date.now() - t));
    }
  }
  return results;
}

/* ---------- helpers shared by checks ---------- */

export function axeViolations(axe: AxeResults | null, ruleIds: string[]): AxeRuleResult[] {
  if (!axe) return [];
  return axe.violations.filter((v) => ruleIds.includes(v.id));
}

export function axeEvidence(
  page: LoadedPage,
  violations: AxeRuleResult[],
  max = 10,
): EvidenceItem[] {
  const out: EvidenceItem[] = [];
  for (const v of violations) {
    for (const node of v.nodes) {
      if (out.length >= max) return out;
      out.push({
        url: page.finalUrl,
        selector: Array.isArray(node.target)
          ? node.target.map(String).join(' ')
          : String(node.target),
        element: node.html.slice(0, 160),
        observed: v.id,
        expected: v.help,
        note: node.failureSummary?.split('\n').slice(1, 3).join('; ').slice(0, 200),
      });
    }
  }
  return out;
}

export function axeRan(ctx: CheckContext): boolean {
  return ctx.pages.some((p) => p.axe);
}

export function pagesOf(ctx: CheckContext): string[] {
  return okPages(ctx).map((p) => p.finalUrl);
}

export function okPages(ctx: CheckContext): LoadedPage[] {
  return ctx.pages.filter((p) => !p.error && (p.status === null || p.status < 400));
}

export function dataOf(p: LoadedPage): PageData {
  return p.data;
}

export function ratioStatus(
  bad: number,
  total: number,
  warnAbove: number,
  failAbove: number,
): CheckStatus {
  if (total === 0) return 'na';
  const r = bad / total;
  if (bad === 0) return 'pass';
  if (r > failAbove) return 'fail';
  if (r > warnAbove) return 'warn';
  return 'pass';
}

export function pct(n: number, d: number): string {
  return d === 0 ? '0%' : `${Math.round((n / d) * 100)}%`;
}
