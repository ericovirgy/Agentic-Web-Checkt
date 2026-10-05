import pc from 'picocolors';
import { describe, expect, it } from 'vitest';
import { badgeLabel, renderBadgeSvg } from '../../src/report/badge.js';
import { escapeHtml, renderHtml } from '../../src/report/html.js';
import { renderMarkdownSummary } from '../../src/report/markdown.js';
import { renderTerminal } from '../../src/report/terminal.js';
import { DIMENSION_WEIGHTS } from '../../src/scoring/index.js';
import type { ScanResult, TaskResult } from '../../src/types.js';
import {
  ANSI_RE,
  makeCheck,
  makeTask,
  minimalScanResult,
  readExampleResult,
  stripAnsi,
  xmlProblem,
} from '../helpers.js';

const excellent = readExampleResult('results-excellent');
const ambiguous = readExampleResult('results-ambiguous-ui');
const minimal = minimalScanResult();

/** The minimal result with its tasks replaced (dimension rows left untouched on purpose). */
function withTasks(tasks: TaskResult[], taskScore: number | null = 0): ScanResult {
  return {
    ...minimal,
    tasks,
    dimensions: minimal.dimensions.map((d) =>
      d.dimension === 'task-success' ? { ...d, score: taskScore } : d,
    ),
  };
}
const allInconclusive = withTasks(
  [
    makeTask({ name: 'a', verdict: 'INCONCLUSIVE' }),
    makeTask({ name: 'b', verdict: 'INCONCLUSIVE' }),
  ],
  null,
);
const optOutOnly = withTasks(
  [
    makeTask({
      name: 'buy',
      verdict: 'BLOCKED',
      blocker: 'consequential-step',
      safety: 'consequential',
    }),
  ],
  null,
);
const crashed: ScanResult = {
  ...minimal,
  checks: [
    ...minimal.checks,
    makeCheck({
      id: 'aria-validity',
      dimension: 'perception',
      status: 'na',
      summary: 'Check crashed; excluded from scoring.',
      error: 'TypeError: boom',
    }),
  ],
};

const ANSI = ANSI_RE;

describe('example result files', () => {
  it('are complete scan results', () => {
    for (const r of [excellent, ambiguous]) {
      expect(r.meta.schema).toBe('1');
      expect(r.meta.methodology).toBe('1');
      expect(r.dimensions).toHaveLength(7);
      expect(r.checks.length).toBeGreaterThan(30);
      expect(typeof r.overall).toBe('number');
    }
    expect(ambiguous.checks.some((c) => c.status === 'fail')).toBe(true);
    expect(ambiguous.checks.some((c) => c.status === 'warn')).toBe(true);
  });
});

describe('renderTerminal', () => {
  it('without colour contains no ANSI sequences and shows the scores', () => {
    const out = renderTerminal(excellent, { color: false });
    expect(out).not.toMatch(ANSI);
    expect(out).toContain('AGENTIC WEB CHECK');
    expect(out).toContain(`v${excellent.meta.version}`);
    expect(out).toContain(`methodology v${excellent.meta.methodology}`);
    expect(out).toContain(excellent.meta.url);
    expect(out).toMatch(new RegExp(`Agent Readiness\\s+${excellent.overall}/100`));
    for (const d of excellent.dimensions) {
      if (d.score === null) continue;
      expect(out).toMatch(new RegExp(`${d.label}\\s+${d.score}\\s`));
    }
    expect(out).toContain(
      `Behavioural verification (${excellent.tasks.length} tasks, baseline agent)`,
    );
  });

  it('with colour follows picocolors (ANSI only where the terminal supports it)', () => {
    const out = renderTerminal(excellent, { color: true });
    if (pc.isColorSupported) expect(out).toMatch(ANSI);
    else expect(out).not.toMatch(ANSI);
    expect(stripAnsi(out)).toBe(renderTerminal(excellent, { color: false }));
  });

  it('lists FAIL and WARNING sections with check titles and ids, heaviest first', () => {
    const out = renderTerminal(ambiguous, { color: false });
    const fails = ambiguous.checks.filter((c) => c.status === 'fail');
    const warns = ambiguous.checks.filter((c) => c.status === 'warn');
    expect(out).toContain(`${fails.length} failures`);
    expect(out).toContain(`${warns.length} warnings`);
    expect(out).toMatch(/\nFAIL\n/);
    expect(out).toMatch(/\nWARNING\n/);
    for (const c of fails)
      expect(out).toContain(`✗ ${c.title} [${c.id}, ${c.dimension}, weight ${c.weight}]`);
    for (const c of warns)
      expect(out).toContain(`! ${c.title} [${c.id}, ${c.dimension}, weight ${c.weight}]`);
    const failBlock = out.slice(out.indexOf('\nFAIL\n'), out.indexOf('\nWARNING\n'));
    const weights = [...failBlock.matchAll(/weight (\d+)\]/g)].map((m) => Number(m[1]));
    expect(weights).toEqual([...weights].sort((a, b) => b - a));
    expect(out).toContain('BEHAVIOURAL TESTS');
    for (const t of ambiguous.tasks) expect(out).toContain(t.verdict);
    expect(out).toContain('Suggested fixes');
    expect(out).toContain(`${ambiguous.pages.length} pages`);
  });

  it('omits FAIL/WARNING sections and task-success when there is nothing to show', () => {
    const r: ScanResult = {
      ...minimal,
      meta: { ...minimal.meta, mode: 'deterministic' },
      checks: minimal.checks.filter((c) => c.status !== 'fail' && c.status !== 'warn'),
      tasks: [],
      suggestedFixes: [],
      dimensions: minimal.dimensions.map((d) =>
        d.dimension === 'task-success' ? { ...d, score: null } : d,
      ),
    };
    const out = renderTerminal(r, { color: false });
    expect(out).not.toMatch(/\nFAIL\n/);
    expect(out).not.toMatch(/\nWARNING\n/);
    expect(out).not.toContain('TASK SUCCESS');
    expect(out).not.toContain('BEHAVIOURAL TESTS');
    expect(out).not.toContain('Suggested fixes');
    expect(out).toContain('Deterministic scan (no tasks run)');
    expect(out).toContain('0 failures');
  });

  it('verbose mode adds passed checks, NA/info and task steps', () => {
    const out = renderTerminal(minimal, { color: false, verbose: true });
    expect(out).toMatch(/\nPASS\n/);
    expect(out).toContain('✓ Page loads [page-load]');
    expect(out).toContain('NOT APPLICABLE / INFO');
    expect(out).toContain('WebMCP [webmcp]');
    expect(out).toContain('1. click {"ref":"e16"}');
    const brief = renderTerminal(minimal, { color: false });
    expect(brief).not.toMatch(/\nPASS\n/);
    expect(brief).not.toContain('1. click');
  });

  it('renders a null overall as n/a', () => {
    const out = renderTerminal({ ...minimal, overall: null }, { color: false });
    expect(out).toMatch(/Agent Readiness\s+n\/a/);
    expect(out).not.toContain('n/a/100');
  });

  it('shows how many checks of each dimension were scored next to the score', () => {
    const out = renderTerminal(minimal, { color: false });
    expect(out).toMatch(/PERCEPTION\s+0\s+0 pass · 0 warn · 1 fail · 1 of 1 check scored/);
    expect(out).toMatch(
      /MACHINE INTERFACES\s+n\/a\s+0 pass · 0 warn · 0 fail · 0 of 1 check scored/,
    );
    expect(out).toMatch(/TASK SUCCESS\s+100\s+1 pass · 0 warn · 0 fail · 1 of 1 task scored/);
    const amb = renderTerminal(ambiguous, { color: false });
    for (const d of ambiguous.dimensions)
      expect(amb).toContain(
        `${d.passed + d.warned + d.failed} of ${d.checks.length} ${d.dimension === 'task-success' ? 'task' : 'check'}s scored`,
      );
  });

  it('states under the overall when behavioural tasks did not pass', () => {
    expect(renderTerminal(minimal, { color: false })).not.toContain('did not pass');
    const out = renderTerminal(
      withTasks([
        makeTask({ name: 'a', verdict: 'PASS' }),
        makeTask({ name: 'b', verdict: 'FAIL' }),
        makeTask({ name: 'c', verdict: 'BLOCKED', blocker: 'captcha' }),
      ]),
      { color: false },
    );
    const lines = out.split('\n');
    const i = lines.findIndex((l) => l.startsWith('Agent Readiness'));
    expect(lines[i + 1]).toBe('2 of 3 behavioural tasks did not pass (1 FAIL, 1 BLOCKED)');
    const amb = renderTerminal(ambiguous, { color: false });
    expect(amb).toContain('3 of 3 behavioural tasks did not pass (3 BLOCKED)');
  });

  it('does not call an all-INCONCLUSIVE or all-excluded run a verification', () => {
    for (const r of [allInconclusive, optOutOnly]) {
      const out = renderTerminal(r, { color: false });
      expect(out).not.toContain('Behavioural verification');
      expect(out).toContain('no task counted, task success not scored');
      expect(out).not.toContain('TASK SUCCESS');
      expect(out).toContain('BEHAVIOURAL TESTS');
    }
    expect(renderTerminal(allInconclusive, { color: false })).toContain(
      '2 of 2 behavioural tasks did not pass (2 INCONCLUSIVE); INCONCLUSIVE not scored',
    );
    expect(renderTerminal(optOutOnly, { color: false })).toContain(
      '1 BLOCKED not scored: consequential task run without --allow-consequential',
    );
  });

  it('always surfaces crashed checks in one line, not only in verbose mode', () => {
    const out = renderTerminal(crashed, { color: false });
    expect(out).toContain('1 check crashed and was not scored (see JSON): aria-validity');
    expect(out).not.toContain('TypeError: boom');
    const verbose = renderTerminal(crashed, { color: false, verbose: true });
    expect(verbose).toContain('(error: TypeError: boom)');
    expect(renderTerminal(minimal, { color: false })).not.toContain('crashed');
  });
});

describe('renderMarkdownSummary', () => {
  it('has a heading with the score and a dimension table row per scored dimension', () => {
    const md = renderMarkdownSummary(excellent);
    expect(md.split('\n')[0]).toBe(`## Agentic Web Check: ${excellent.overall}/100`);
    expect(md).toContain('| Dimension | Score | Pass | Warn | Fail |');
    expect(md).toContain('|---|---:|---:|---:|---:|');
    for (const d of excellent.dimensions) {
      if (d.dimension === 'task-success' && d.score === null) continue;
      expect(md).toContain(
        `| ${d.label} | ${d.score ?? 'n/a'} | ${d.passed} | ${d.warned} | ${d.failed} |`,
      );
    }
    expect(md).toContain(`**${excellent.meta.url}**`);
    expect(md).toContain(
      `behavioural verification, ${excellent.tasks.length} tasks (baseline agent)`,
    );
    expect(md).toContain('### Behavioural tests');
    expect(md).toContain('| Task | Verdict | Steps | Reason |');
    for (const t of excellent.tasks) expect(md).toContain(`| ${t.verdict} | ${t.steps.length} |`);
    expect(md).toMatch(/<sub>\d+ pages · [\d.]+ s · .* · \[methodology\]\(.*SCORING\.md\)<\/sub>$/);
  });

  it('lists failures and warnings with ids and honours title/maxItems options', () => {
    const md = renderMarkdownSummary(ambiguous, { title: 'Nightly', maxItems: 2 });
    const fails = ambiguous.checks.filter((c) => c.status === 'fail');
    const warns = ambiguous.checks.filter((c) => c.status === 'warn');
    expect(md.startsWith(`## Nightly: ${ambiguous.overall}/100`)).toBe(true);
    expect(md).toContain(`### ❌ Failures (${fails.length})`);
    expect(md).toContain(`### ⚠️ Warnings (${warns.length})`);
    const failLines = md.split('\n').filter((l) => /^- \*\*.*\(`.*`, weight \d+\):/.test(l));
    expect(failLines).toHaveLength(2);
    const fixLines = md.split('\n').filter((l) => /^\d+\. \*\*/.test(l));
    expect(fixLines.length).toBeLessThanOrEqual(2);
  });

  it('escapes pipes in task text and skips the task-success row when unscored', () => {
    const r: ScanResult = {
      ...minimal,
      tasks: [{ ...(minimal.tasks[0] as ScanResult['tasks'][0]), goal: 'a | b', reason: 'c | d' }],
      dimensions: minimal.dimensions.map((d) =>
        d.dimension === 'task-success' ? { ...d, score: null } : d,
      ),
    };
    const md = renderMarkdownSummary(r);
    expect(md).toContain('| a \\| b | PASS | 1 | c \\| d |');
    expect(md).not.toContain('| TASK SUCCESS |');
    expect(md).toContain('| INTERACTION | n/a | 0 | 0 | 0 |');
  });

  it('renders n/a for a null overall', () => {
    expect(renderMarkdownSummary({ ...minimal, overall: null })).toContain(
      '## Agentic Web Check: n/a/100',
    );
  });

  it('adds a Scored column, a task-outcome line and a crashed-checks note', () => {
    const md = renderMarkdownSummary(minimal);
    expect(md).toContain('| Dimension | Score | Pass | Warn | Fail | Scored |');
    expect(md).toContain('| PERCEPTION | 0 | 0 | 0 | 1 | 1/1 |');
    expect(md).toContain('| MACHINE INTERFACES | n/a | 0 | 0 | 0 | 0/1 |');
    expect(md).toContain('| TASK SUCCESS | 100 | 1 | 0 | 0 | 1/1 |');
    expect(md).not.toContain('did not pass');
    expect(md).not.toContain('crashed');
    const failing = renderMarkdownSummary(
      withTasks(
        [makeTask({ name: 'a', verdict: 'FAIL' }), makeTask({ name: 'b', verdict: 'PASS' })],
        50,
      ),
    );
    expect(failing).toContain('**1 of 2 behavioural tasks did not pass (1 FAIL)**');
    expect(renderMarkdownSummary(crashed)).toContain(
      '**1 check crashed and was not scored** (see JSON): `aria-validity`',
    );
    for (const r of [allInconclusive, optOutOnly]) {
      const out = renderMarkdownSummary(r);
      expect(out).not.toContain('behavioural verification');
      expect(out).toContain('no task counted: task success not scored');
    }
  });
});

describe('badgeLabel / renderBadgeSvg', () => {
  it('words the label after what was tested', () => {
    expect(badgeLabel(excellent)).toEqual({
      label: `Agent Ready · verified (${excellent.tasks.length} tasks)`,
      message: `${excellent.overall}/100 · v1`,
      color: '#2e7d32',
    });
    const det: ScanResult = {
      ...minimal,
      meta: { ...minimal.meta, mode: 'deterministic' },
      tasks: [],
    };
    expect(badgeLabel(det).label).toBe('Agent Ready · scan');
    expect(badgeLabel(det).label).not.toContain('verified');
    expect(badgeLabel(det).label.toLowerCase()).not.toContain('safe');
  });

  it('says "verified" only when at least one task counted towards TASK SUCCESS', () => {
    expect(badgeLabel(allInconclusive).label).toBe('Agent Ready · scan');
    expect(badgeLabel(optOutOnly).label).toBe('Agent Ready · scan');
    expect(badgeLabel(minimal).label).toBe('Agent Ready · verified (1 task)');
    const mixed = withTasks([
      makeTask({ name: 'a', verdict: 'FAIL' }),
      makeTask({ name: 'b', verdict: 'INCONCLUSIVE' }),
      makeTask({
        name: 'c',
        verdict: 'BLOCKED',
        blocker: 'consequential-step',
        safety: 'consequential',
      }),
      makeTask({ name: 'd', verdict: 'BLOCKED', blocker: 'bot-wall' }),
    ]);
    // 4 ran, 2 counted (FAIL + bot-wall BLOCKED): verified means tasks ran, not that they passed.
    expect(badgeLabel(mixed).label).toBe('Agent Ready · verified (2 tasks)');
  });

  it('colours by score band and greys out n/a', () => {
    const at = (overall: number | null) => badgeLabel({ ...minimal, overall }).color;
    expect(at(100)).toBe('#2e7d32');
    expect(at(90)).toBe('#2e7d32');
    expect(at(89)).toBe('#558b2f');
    expect(at(70)).toBe('#558b2f');
    expect(at(69)).toBe('#f9a825');
    expect(at(50)).toBe('#f9a825');
    expect(at(49)).toBe('#c62828');
    expect(at(0)).toBe('#c62828');
    expect(at(null)).toBe('#9f9f9f');
    expect(badgeLabel({ ...minimal, overall: null }).message).toBe('n/a');
  });

  it('produces well-formed SVG with the label, message, colour and version', () => {
    for (const r of [excellent, ambiguous, minimal, { ...minimal, overall: null }]) {
      const svg = renderBadgeSvg(r);
      expect(xmlProblem(svg)).toBeNull();
      expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
      const { label, message, color } = badgeLabel(r);
      expect(svg).toContain(`aria-label="${label}: ${message}"`);
      expect(svg).toContain(`fill="${color}"`);
      expect(svg).toContain(`agentic-web-check ${r.meta.version}`);
      expect(svg).toContain(r.meta.finishedAt.slice(0, 10));
      expect(svg).toMatch(/width="\d+" height="20"/);
    }
  });

  it('escapes & and < in text content', () => {
    const r: ScanResult = { ...minimal, meta: { ...minimal.meta, version: '1<2&3' } };
    const svg = renderBadgeSvg(r);
    expect(svg).toContain('1&lt;2&amp;3');
    expect(svg).not.toContain('1<2&3');
    expect(xmlProblem(svg)).toBeNull();
  });
});

describe('renderHtml', () => {
  const html = renderHtml(minimal);

  it('is a self-contained document without external scripts or stylesheets', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).not.toMatch(/<script\s+src/i);
    expect(html).not.toMatch(/<link\s+[^>]*rel="?stylesheet/i);
    expect(html).not.toMatch(/https?:\/\/[^"'\s]+\.(js|css)\b/);
    expect(html).toContain('<meta name="generator" content="agentic-web-check 0.1.0-test">');
    expect(html).toContain(
      '<title>Agentic Web Check report: http://127.0.0.1:1/?q=&lt;script&gt;alert(1)&lt;/script&gt;&amp;x=&quot;y&quot;</title>',
    );
  });

  it('escapes untrusted strings everywhere they appear', () => {
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('3 of 12 controls have no name &lt;b&gt;&amp;&quot;&lt;/b&gt;');
    expect(html).not.toContain('<b>&"</b>');
    expect(html).toContain('Home &lt;Northwind&gt;');
    expect(html).toContain('Find the email address &lt;for&gt; contacting &quot;Northwind&quot;');
    expect(escapeHtml(`<a href="x">Tom's & Jerry</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom&#39;s &amp; Jerry&lt;/a&gt;',
    );
  });

  it('contains every section with counts', () => {
    expect(html).toContain('<details class="section" id="failures" open>');
    expect(html).toContain('Failures (1)');
    expect(html).toContain('<details class="section" id="warnings" open>');
    expect(html).toContain('Warnings (1)');
    expect(html).toContain('<details class="section" id="tasks" open>');
    expect(html).toContain('Behavioural tests (1)');
    expect(html).toContain('<details class="section" id="passed">');
    expect(html).toContain('Passed checks (1)');
    expect(html).toContain('<details class="section" id="other">');
    expect(html).toContain('Not applicable / info (1)');
    expect(html).toContain('<details class="section" id="fixes" open>');
    expect(html).toContain('<details class="section" id="pages" open>');
    expect(html).toContain('Pages scanned (1)');
    expect(html).toContain('<details class="section" id="methodology" open>');
  });

  it('renders checks, tasks, fixes and the scoreboard', () => {
    expect(html).toContain('id="check-control-accessible-name"');
    expect(html).toContain('<span class="badge fail">FAIL</span>');
    expect(html).toContain('<span class="badge warn">WARN</span>');
    expect(html).toContain('<span class="badge na">NA</span>');
    expect(html).toContain('<span class="chip"><b>unnamed</b>: 3</span>');
    expect(html).toContain('id="task-find-contact-email"');
    expect(html).toContain('<span class="badge pass">PASS</span>');
    expect(html).toContain('<code class="step-tool">click</code>');
    expect(html).toContain('hello@northwind.example');
    expect(html).toContain('<a href="#check-control-accessible-name">');
    expect(html).toContain('Add aria-label to icon buttons');
    expect(html).toMatch(/<p class="big">61<span class="denom">\/100<\/span><\/p>/);
    expect(html).toContain('<th scope="row">PERCEPTION</th>');
    expect(html).toContain(
      '<th class="num" title="scored checks / checks in the dimension">Scored</th>',
    );
    expect(html).toContain('<td class="num muted">1/1</td>');
    expect(html).toContain('<td class="num muted">0/1</td>');
    // unscored task-success row is hidden only when null; here it is 100
    expect(html).toContain('<th scope="row">TASK SUCCESS</th>');
    expect(html).toContain('Behavioural verification (1 task, agent baseline)');
  });

  it('explains the methodology with the live weights', () => {
    for (const [k, w] of Object.entries(DIMENSION_WEIGHTS))
      expect(html).toContain(`<li>${k}: ${w} &times; 0.7 = ${Math.round(w * 70) / 100}</li>`);
    expect(html).toContain('<li>task-success: 30</li>');
    const det = renderHtml({
      ...minimal,
      meta: { ...minimal.meta, mode: 'deterministic' },
      tasks: [],
      dimensions: minimal.dimensions.map((d) =>
        d.dimension === 'task-success' ? { ...d, score: null } : d,
      ),
    });
    expect(det).toContain('<li>perception: 20</li>');
    expect(det).toContain('task-success: 30 when tasks are run');
    expect(det).not.toContain('<details class="section" id="tasks"');
    expect(det).toContain('Deterministic scan');
    expect(det).toContain('only as broad as its scorable checks');
    expect(det).toContain('<code>--allow-consequential</code>');
    for (const r of [allInconclusive, optOutOnly]) {
      const out = renderHtml(r);
      expect(out).not.toContain('Behavioural verification');
      expect(out).toContain('no task counted, task success not scored');
    }
  });

  it('renders the example results without leaking raw markup from summaries', () => {
    for (const r of [excellent, ambiguous]) {
      const out = renderHtml(r);
      expect(out).toContain(`Failures (${r.checks.filter((c) => c.status === 'fail').length})`);
      expect(out).toContain(`Behavioural tests (${r.tasks.length})`);
      expect(out).toContain(`Pages scanned (${r.pages.length})`);
      for (const c of r.checks) expect(out).toContain(`id="check-${c.id}"`);
      expect(out).not.toMatch(/<script\s+src/i);
    }
  });
});
