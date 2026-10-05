import { describe, expect, it } from 'vitest';
import { globMatch, parseRobots, robotsAllows } from '../../src/browser/probes.js';
import { renderHtml } from '../../src/report/html.js';
import { renderMarkdownSummary } from '../../src/report/markdown.js';
import { normaliseInputUrl } from '../../src/scanner.js';
import { omitFrameContent } from '../../src/tasks/llm-agent.js';
import { markdownCell, redactSecrets, stripControl } from '../../src/util/text.js';
import { minimalScanResult } from '../helpers.js';

describe('robots.txt glob matching (linear, no regex)', () => {
  it('matches prefixes, wildcards and end anchors like RFC 9309', () => {
    expect(globMatch('/private', '/private/x')).toBe(true);
    expect(globMatch('/private/', '/private')).toBe(false);
    expect(globMatch('/*.php', '/a/b/c.php')).toBe(true);
    expect(globMatch('/*.php$', '/a/b/c.php')).toBe(true);
    expect(globMatch('/*.php$', '/a/b/c.php?x=1')).toBe(false);
    expect(globMatch('/a*b*c', '/axxbyyc/tail')).toBe(true);
    expect(globMatch('/x', '/y')).toBe(false);
  });
  it('terminates quickly on pathological patterns', () => {
    const rules = parseRobots(`User-agent: *\nDisallow: /${'*'.repeat(40)}z\n`);
    const started = Date.now();
    const r = robotsAllows(rules, 'AgenticWebCheck', `/${'a'.repeat(5000)}`);
    expect(Date.now() - started).toBeLessThan(500);
    expect(r.allowed).toBe(true);
  });
});

describe('LLM-facing snapshot omits iframe subtrees', () => {
  it('keeps the iframe line and drops its children only', () => {
    const snap = [
      '- main [ref=e1]:',
      '  - link "A" [ref=e2]',
      '  - iframe [ref=e3]:',
      '    - textbox "secret" [ref=f1e2]',
      '    - button "Go" [ref=f1e3]',
      '  - link "B" [ref=e4]',
    ].join('\n');
    const out = omitFrameContent(snap);
    expect(out).toContain('link "A"');
    expect(out).toContain('link "B"');
    expect(out).toContain('iframe [ref=e3] [content omitted for the agent]');
    expect(out).not.toContain('secret');
    expect(out).not.toContain('f1e3');
  });
});

describe('output sanitisation', () => {
  it('strips control characters, ANSI and OSC sequences', () => {
    const esc = String.fromCharCode(27);
    expect(stripControl(`a${esc}[31mred${esc}]8;;http://x\u0007b\u0000c`)).toBe(
      'a31mred8;;http://xbc'.replace('31m', '31m'),
    );
    expect(stripControl('line1\nline2')).toBe('line1 line2');
    expect(stripControl('line1\nline2', true)).toBe('line1\nline2');
  });
  it('neutralises markdown table and mention injection', () => {
    expect(markdownCell('a|b <img> @octocat\n::error::x')).toBe(
      'a\\|b &lt;img&gt; @\u200boctocat ::error::x',
    );
  });
  it('redacts secret-looking tokens in provider errors', () => {
    expect(redactSecrets('invalid key sk-abcdefghijklmnop1234 and Bearer abcdefghijkl')).toBe(
      'invalid key [redacted] and [redacted]',
    );
  });
  it('removes credentials from the input URL', () => {
    expect(normaliseInputUrl('https://user:pw@example.com/path')).toBe('https://example.com/path');
    expect(normaliseInputUrl('example.com')).toBe('https://example.com/');
  });
  it('does not let a javascript: URL or a newline reach the report/summary', () => {
    const r = minimalScanResult();
    r.meta.url = 'javascript:alert(1)';
    r.tasks = [
      {
        name: 't',
        goal: 'x',
        verdict: 'FAIL',
        reason: 'bad\n::error::injected',
        agent: 'baseline',
        safety: 'read-only',
        startUrl: 'https://a',
        finalUrl: 'https://a',
        finalTitle: '',
        steps: [],
        assertions: [],
        screenshots: [],
        consoleErrors: [],
        durationMs: 1,
      },
    ];
    const html = renderHtml(r);
    expect(html).not.toContain('href="javascript:');
    const md = renderMarkdownSummary(r);
    expect(md).not.toMatch(/\n::error::/);
  });
});
