import { summarizeTaskOutcomes, taskOutcomeLine } from '../scoring/index.js';
import type { ScanResult } from '../types.js';
import { markdownCell } from '../util/text.js';

/** GitHub job summary / PR comment markdown. */
export function renderMarkdownSummary(
  result: ScanResult,
  opts: { title?: string; maxItems?: number } = {},
): string {
  const max = opts.maxItems ?? 10;
  const lines: string[] = [];
  const outcomes = summarizeTaskOutcomes(result.tasks);
  const mode =
    result.meta.mode !== 'behavioural'
      ? 'deterministic scan'
      : outcomes.counted > 0
        ? `behavioural verification, ${result.tasks.length} tasks (${result.meta.options.agent} agent)`
        : `behavioural run, ${result.tasks.length} tasks (${result.meta.options.agent} agent), no task counted: task success not scored`;
  lines.push(`## ${opts.title ?? 'Agentic Web Check'}: ${result.overall ?? 'n/a'}/100`);
  lines.push('');
  lines.push(
    `**${markdownCell(result.meta.url)}** · ${mode} · v${result.meta.version} · methodology v${result.meta.methodology}`,
  );
  lines.push('');
  const taskLine = taskOutcomeLine(result.tasks);
  if (taskLine) {
    lines.push(`**${taskLine}**`);
    lines.push('');
  }
  const crashed = result.checks.filter((c) => c.error);
  if (crashed.length) {
    lines.push(
      `**${crashed.length} check${crashed.length === 1 ? '' : 's'} crashed and ${crashed.length === 1 ? 'was' : 'were'} not scored** (see JSON): ${crashed.map((c) => `\`${c.id}\``).join(', ')}`,
    );
    lines.push('');
  }
  lines.push('| Dimension | Score | Pass | Warn | Fail | Scored |');
  lines.push('|---|---:|---:|---:|---:|---:|');
  for (const d of result.dimensions) {
    if (d.dimension === 'task-success' && d.score === null) continue;
    lines.push(
      `| ${d.label} | ${d.score ?? 'n/a'} | ${d.passed} | ${d.warned} | ${d.failed} | ${d.passed + d.warned + d.failed}/${d.checks.length} |`,
    );
  }
  lines.push('');
  const fails = result.checks
    .filter((c) => c.status === 'fail')
    .sort((a, b) => b.weight - a.weight);
  const warns = result.checks
    .filter((c) => c.status === 'warn')
    .sort((a, b) => b.weight - a.weight);
  if (fails.length) {
    lines.push(`### ❌ Failures (${fails.length})`);
    for (const c of fails.slice(0, max))
      lines.push(`- **${c.title}** (\`${c.id}\`, weight ${c.weight}): ${markdownCell(c.summary)}`);
    lines.push('');
  }
  if (warns.length) {
    lines.push(`### ⚠️ Warnings (${warns.length})`);
    for (const c of warns.slice(0, max))
      lines.push(`- **${c.title}** (\`${c.id}\`): ${markdownCell(c.summary)}`);
    lines.push('');
  }
  if (result.tasks.length) {
    lines.push('### Behavioural tests');
    lines.push('| Task | Verdict | Steps | Reason |');
    lines.push('|---|---|---:|---|');
    for (const t of result.tasks)
      lines.push(
        `| ${markdownCell(t.goal)} | ${t.verdict} | ${t.steps.length} | ${markdownCell(t.reason.slice(0, 120))} |`,
      );
    lines.push('');
  }
  if (result.suggestedFixes.length) {
    lines.push('### Suggested fixes');
    result.suggestedFixes.slice(0, max).forEach((f, i) => {
      lines.push(`${i + 1}. **${f.title}**: ${f.remediation}`);
    });
    lines.push('');
  }
  lines.push(
    `<sub>${result.pages.length} pages · ${(result.meta.durationMs / 1000).toFixed(1)} s · ${result.meta.finishedAt} · [methodology](https://github.com/ericovirgy/agentic-web-check/blob/main/docs/SCORING.md)</sub>`,
  );
  return lines.join('\n');
}
