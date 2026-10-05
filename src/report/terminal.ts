import pc from 'picocolors';

type Colors = ReturnType<typeof pc.createColors>;

import { summarizeTaskOutcomes, taskOutcomeLine } from '../scoring/index.js';
import type { CheckResult, ScanResult, TaskResult } from '../types.js';
import { stripControl } from '../util/text.js';

export interface TerminalOptions {
  color?: boolean;
  verbose?: boolean;
}

function scoreColor(n: number | null, c: Colors): string {
  if (n === null) return c.dim('n/a');
  const s = String(n).padStart(3);
  if (n >= 90) return c.green(s);
  if (n >= 70) return c.yellow(s);
  if (n >= 50) return c.magenta(s);
  return c.red(s);
}

export function renderTerminal(result: ScanResult, opts: TerminalOptions = {}): string {
  const c = opts.color === false ? pc.createColors(false) : pc;
  const lines: string[] = [];
  const outcomes = summarizeTaskOutcomes(result.tasks);
  const agentText = `${result.meta.options.agent} agent${result.meta.options.model ? `, ${result.meta.options.model}` : ''}`;
  const modeText =
    result.meta.mode !== 'behavioural'
      ? 'Deterministic scan (no tasks run)'
      : outcomes.counted > 0
        ? `Behavioural verification (${result.tasks.length} tasks, ${agentText})`
        : `Behavioural run (${result.tasks.length} tasks, ${agentText}) · no task counted, task success not scored`;
  lines.push('');
  lines.push(
    c.bold('AGENTIC WEB CHECK') +
      c.dim(`  v${result.meta.version} · methodology v${result.meta.methodology}`),
  );
  lines.push(c.cyan(result.meta.url));
  lines.push(c.dim(modeText));
  lines.push('');
  lines.push(
    `${c.bold('Agent Readiness')}  ${c.bold(scoreColor(result.overall, c))}${result.overall !== null ? c.dim('/100') : ''}`,
  );
  const taskLine = taskOutcomeLine(result.tasks);
  if (taskLine) lines.push(c.yellow(taskLine));
  lines.push('');
  for (const d of result.dimensions) {
    if (d.dimension === 'task-success' && d.score === null) continue;
    const scored = d.passed + d.warned + d.failed;
    const unit = d.dimension === 'task-success' ? 'task' : 'check';
    lines.push(
      `${d.label.padEnd(20)}${scoreColor(d.score, c)}   ${c.dim(`${d.passed} pass · ${d.warned} warn · ${d.failed} fail · ${scored} of ${d.checks.length} ${unit}${d.checks.length === 1 ? '' : 's'} scored`)}`,
    );
  }
  lines.push('');
  const passed = result.checks.filter((x) => x.status === 'pass').length;
  const warned = result.checks.filter((x) => x.status === 'warn').length;
  const failed = result.checks.filter((x) => x.status === 'fail').length;
  const na = result.checks.filter((x) => x.status === 'na' || x.status === 'info').length;
  lines.push(
    `${c.green(`${passed} passed`)}  ${c.yellow(`${warned} warnings`)}  ${c.red(`${failed} failures`)}  ${c.dim(`${na} not applicable/info`)}`,
  );
  const crashed = result.checks.filter((x) => x.error);
  if (crashed.length)
    lines.push(
      c.magenta(
        `${crashed.length} check${crashed.length === 1 ? '' : 's'} crashed and ${crashed.length === 1 ? 'was' : 'were'} not scored (see JSON): ${crashed.map((x) => x.id).join(', ')}`,
      ),
    );
  lines.push('');

  const byStatus = (s: CheckResult['status']) =>
    result.checks.filter((x) => x.status === s).sort((a, b) => b.weight - a.weight);
  if (failed) {
    lines.push(c.red(c.bold('FAIL')));
    for (const ch of byStatus('fail')) lines.push(...checkLines(ch, c, opts.verbose));
    lines.push('');
  }
  if (warned) {
    lines.push(c.yellow(c.bold('WARNING')));
    for (const ch of byStatus('warn')) lines.push(...checkLines(ch, c, opts.verbose));
    lines.push('');
  }
  if (opts.verbose) {
    lines.push(c.green(c.bold('PASS')));
    for (const ch of byStatus('pass'))
      lines.push(`  ${c.green('✓')} ${ch.title} ${c.dim(`[${ch.id}] ${ch.summary}`)}`);
    lines.push('');
    const rest = result.checks.filter((x) => x.status === 'na' || x.status === 'info');
    if (rest.length) {
      lines.push(c.dim(c.bold('NOT APPLICABLE / INFO')));
      for (const ch of rest)
        lines.push(
          `  ${c.dim('·')} ${ch.title} ${c.dim(`[${ch.id}] ${ch.summary}${ch.error ? ` (error: ${ch.error})` : ''}`)}`,
        );
      lines.push('');
    }
  }
  if (result.tasks.length) {
    lines.push(c.bold('BEHAVIOURAL TESTS'));
    for (const t of result.tasks) lines.push(...taskLines(t, c, opts.verbose));
    lines.push('');
  }
  if (result.suggestedFixes.length) {
    lines.push(c.bold('Suggested fixes'));
    result.suggestedFixes.forEach((f, i) => {
      lines.push(`  ${i + 1}. ${c.bold(f.title)} ${c.dim(`[${f.checkId}, weight ${f.weight}]`)}`);
      lines.push(`     ${wrap(f.remediation, 90, '     ')}`);
    });
    lines.push('');
  }
  lines.push(
    c.dim(
      `${result.pages.length} pages · ${(result.meta.durationMs / 1000).toFixed(1)} s · ${result.meta.browser.name} ${result.meta.browser.version} · ${result.meta.finishedAt}`,
    ),
  );
  return stripControl(lines.join('\n'), true);
}

function checkLines(ch: CheckResult, c: Colors, verbose?: boolean): string[] {
  const out = [
    `  ${ch.status === 'fail' ? c.red('✗') : c.yellow('!')} ${ch.title} ${c.dim(`[${ch.id}, ${ch.dimension}, weight ${ch.weight}]`)}`,
  ];
  out.push(`    ${ch.summary}`);
  const n = verbose ? 8 : 3;
  for (const e of ch.evidence.slice(0, n)) {
    const bits = [
      e.element ?? e.selector ?? '',
      e.observed ? `observed: ${e.observed}` : '',
      e.expected ? `expected: ${e.expected}` : '',
    ].filter(Boolean);
    if (bits.length) out.push(c.dim(`    · ${bits.join(' · ').slice(0, 220)}`));
  }
  if (ch.evidence.length > n)
    out.push(c.dim(`    · … ${ch.evidence.length - n} more in JSON/HTML report`));
  return out;
}

function taskLines(t: TaskResult, c: Colors, verbose?: boolean): string[] {
  const v =
    t.verdict === 'PASS'
      ? c.green('PASS')
      : t.verdict === 'FAIL'
        ? c.red('FAIL')
        : t.verdict === 'BLOCKED'
          ? c.yellow('BLOCKED')
          : c.magenta('INCONCLUSIVE');
  const out = [
    `  ${t.goal.length > 70 ? `${t.goal.slice(0, 67)}…` : t.goal}: ${v} ${c.dim(`(${t.steps.length} steps, ${(t.durationMs / 1000).toFixed(1)} s)`)}`,
  ];
  out.push(c.dim(`    ${t.reason}`));
  if (verbose)
    for (const s of t.steps)
      out.push(
        c.dim(
          `    ${s.index}. ${s.tool} ${JSON.stringify(s.args).slice(0, 80)} → ${s.result.split('\n')[0]?.slice(0, 100)}`,
        ),
      );
  return out;
}

function wrap(text: string, width: number, indent: string): string {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + w).length > width) {
      lines.push(cur.trimEnd());
      cur = '';
    }
    cur += `${w} `;
  }
  if (cur) lines.push(cur.trimEnd());
  return lines.join(`\n${indent}`);
}
