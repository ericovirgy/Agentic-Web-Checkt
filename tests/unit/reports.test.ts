import pc from 'picocolors';
import { describe, expect, it } from 'vitest';
import { badgeLabel, renderBadgeSvg } from '../../src/report/badge.js';
import { escapeHtml, renderHtml } from '../../src/report/html.js';
import { renderMarkdownSummary } from '../../src/report/markdown.js';
import { renderTerminal } from '../../src/report/terminal.js';
import { DIMENSION_WEIGHTS } from '../../src/scoring/index.js';
import type { ScanResult } from '../../src/types.js';
import { minimalScanResult, readExampleResult, xmlProblem } from '../helpers.js';

const excellent = readExampleResult('results-excellent');
const ambiguous = readExampleResult('results-ambiguous-ui');
const minimal = minimalScanResult();

const ANSI = /\u001b\[[0-9;]*m/;

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
    expect(out).toContain(`Behavioural verification (${excellent.tasks.length} tasks, baseline agent)`);
  });

  it('with colour follows picocolors (ANSI only where the terminal supports it)', () => {
    const out = renderTerminal(excellent, { color: true });
    if (pc.isColorSupported) expect(out).toMatch(ANSI);
    else expect(out).not.toMatch(ANSI);
    expect(out.replace(/\u001b\[[0-9;]*m/g, '')).toBe(renderTerminal(excellent, { color: false }));
  });

  it('lists FAIL and WARNING sections with check titles and ids, heaviest first', () => {
    const out = renderTerminal(ambiguous, { color: false });
    const fails = ambiguous.checks.filter((c) => c.status === 'fail');
    const warns = ambiguous.checks.filter((c) => c.status === 'warn');
    expect(out).toContain(`${fails.length} failures`);
    expect(out).toContain(`${warns.length} warnings`);
    expect(out).toMatch(/\nFAIL\n/);
    expect(out).toMatch(/\nWARNING\n/);
    for (const c of fails) expect(out).toContain(`✗ ${c.title} [${c.id}, ${c.dimension}, weight ${c.weight}]`);
    for (const c of warns) expect(out).toContain(`! ${c.title} [${c.id}, ${c.dimension}, weight ${c.weight}]`);
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
});

describe('renderMarkdownSummary', () => {
  it('has a heading with the score and a dimension table row per scored dimension', () => {
    const md = renderMarkdownSummary(excellent);
    expect(md.split('\n')[0]).toBe(`## Agentic Web Check: ${excellent.overall}/100`);
    expect(md).toContain('| Dimension | Score | Pass | Warn | Fail |');
    expect(md).toContain('|---|---:|---:|---:|---:|');
    for (const d of excellent.dimensions) {
      if (d.dimension === 'task-success' && d.score === null) continue;
      expect(md).toContain(`| ${d.label} | ${d.score ?? 'n/a'} | ${d.passed} | ${d.warned} | ${d.failed} |`);
    }
    expect(md).toContain(`**${excellent.meta.url}**`);
    expect(md).toContain(`behavioural verification, ${excellent.tasks.length} tasks (baseline agent)`);
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
    expect(renderMarkdownSummary({ ...minimal, overall: null })).toContain('## Agentic Web Check: n/a/100');
  });
});

describe('badgeLabel / renderBadgeSvg', () => {
  it('words the label after what was tested', () => {
    expect(badgeLabel(excellent)).toEqual({
      label: `Agent Ready · verified (${excellent.tasks.length} tasks)`,
      message: `${excellent.overall}/100 · v1`,
      color: '#2e7d32',
    });
    const det: ScanResult = { ...minimal, meta: { ...minimal.meta, mode: 'deterministic' }, tasks: [] };
    expect(badgeLabel(det).label).toBe('Agent Ready · scan');
    expect(badgeLabel(det).label).not.toContain('verified');
    expect(badgeLabel(det).label.toLowerCase()).not.toContain('safe');
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
    expect(html).toContain('<title>Agentic Web Check report: http://127.0.0.1:1/?q=&lt;script&gt;alert(1)&lt;/script&gt;&amp;x=&quot;y&quot;</title>');
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
