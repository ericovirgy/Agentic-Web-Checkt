import { describe, expect, it } from 'vitest';
import { parseRobots, robotsAllows, textFromHtml } from '../../src/browser/probes.js';

const ROBOTS = `
# Northwind robots
User-agent: *
Disallow: /cart/
Disallow: /checkout
Allow: /cart/help   # inline comment
Crawl-delay: 5

User-agent: GPTBot
User-agent: ClaudeBot
Disallow: /

User-Agent: AgenticWebCheck
Allow: /

Sitemap: https://northwind.example/sitemap.xml
sitemap: https://northwind.example/sitemap-products.xml
Content-Signal: ai-train=no, search=yes
`;

describe('parseRobots', () => {
  const rules = parseRobots(ROBOTS);

  it('splits groups on user-agent lines and merges consecutive user-agents', () => {
    expect(rules.groups).toHaveLength(3);
    expect(rules.groups[0]?.agents).toEqual(['*']);
    expect(rules.groups[1]?.agents).toEqual(['gptbot', 'claudebot']);
    expect(rules.groups[2]?.agents).toEqual(['agenticwebcheck']);
  });

  it('collects allow and disallow rules per group, stripping comments', () => {
    expect(rules.groups[0]?.disallow).toEqual(['/cart/', '/checkout']);
    expect(rules.groups[0]?.allow).toEqual(['/cart/help']);
    expect(rules.groups[1]?.disallow).toEqual(['/']);
    expect(rules.groups[1]?.allow).toEqual([]);
    expect(rules.groups[2]?.allow).toEqual(['/']);
  });

  it('collects sitemaps (case-insensitive key) and the Content-Signal value', () => {
    expect(rules.sitemaps).toEqual([
      'https://northwind.example/sitemap.xml',
      'https://northwind.example/sitemap-products.xml',
    ]);
    expect(rules.contentSignal).toBe('ai-train=no, search=yes');
  });

  it('handles CRLF, empty bodies and rules before any group', () => {
    expect(parseRobots('')).toEqual({ groups: [], sitemaps: [], contentSignal: null });
    const crlf = parseRobots('User-agent: *\r\nDisallow: /a\r\n\r\nUser-agent: x\r\nAllow: /b\r\n');
    expect(crlf.groups).toHaveLength(2);
    expect(crlf.groups[0]?.disallow).toEqual(['/a']);
    // a Disallow before any User-agent is ignored; a Sitemap anywhere is kept
    const orphan = parseRobots('Disallow: /x\nSitemap: https://s.example/s.xml\nno colon here\n');
    expect(orphan.groups).toEqual([]);
    expect(orphan.sitemaps).toEqual(['https://s.example/s.xml']);
  });

  it('starts a new group when user-agent follows rules', () => {
    const r = parseRobots('User-agent: a\nDisallow: /x\nUser-agent: b\nDisallow: /y\n');
    expect(r.groups.map((g) => g.agents)).toEqual([['a'], ['b']]);
  });
});

describe('robotsAllows', () => {
  const rules = parseRobots(ROBOTS);

  it('allows everything when there are no groups at all', () => {
    expect(robotsAllows(parseRobots(''), 'Anything', '/x')).toEqual({ allowed: true, group: null });
  });

  it('uses the * group for unknown agents', () => {
    expect(robotsAllows(rules, 'Googlebot', '/products')).toEqual({ allowed: true, group: '*' });
    expect(robotsAllows(rules, 'Googlebot', '/cart/')).toEqual({ allowed: false, group: '*' });
    expect(robotsAllows(rules, 'Googlebot', '/checkout/step-2')).toMatchObject({ allowed: false });
  });

  it('prefers the specific user-agent group over * (token match is case-insensitive, substring)', () => {
    expect(robotsAllows(rules, 'GPTBot/1.0', '/products')).toEqual({
      allowed: false,
      group: 'gptbot,claudebot',
    });
    expect(robotsAllows(rules, 'claudebot', '/')).toMatchObject({ allowed: false });
    expect(robotsAllows(rules, 'Mozilla/5.0 AgenticWebCheck/0.1.0', '/cart/')).toEqual({
      allowed: true,
      group: 'agenticwebcheck',
    });
  });

  it('matches a group only when its token is contained in the agent string (RFC 9309)', () => {
    // "bot" does not contain the token "gptbot", so it falls back to the * group
    expect(robotsAllows(rules, 'bot', '/products').group).toBe('*');
    expect(robotsAllows(rules, 'Mozilla/5.0 (compatible; GPTBot/1.1)', '/products')).toEqual({
      allowed: false,
      group: 'gptbot,claudebot',
    });
  });

  it('longest match wins', () => {
    // * group: Disallow /cart/ (6) vs Allow /cart/help (10)
    expect(robotsAllows(rules, 'Googlebot', '/cart/help/faq').allowed).toBe(true);
    expect(robotsAllows(rules, 'Googlebot', '/cart/items').allowed).toBe(false);
    const r = parseRobots('User-agent: *\nAllow: /private\nDisallow: /private/secret\n');
    expect(robotsAllows(r, 'x', '/private/notes').allowed).toBe(true);
    expect(robotsAllows(r, 'x', '/private/secret/1').allowed).toBe(false);
  });

  it('allow wins ties', () => {
    const r = parseRobots('User-agent: *\nDisallow: /page\nAllow: /page\n');
    expect(robotsAllows(r, 'x', '/page').allowed).toBe(true);
  });

  it('matches from the start of the path and supports * and $', () => {
    const r = parseRobots('User-agent: *\nDisallow: /*.pdf$\nDisallow: /tmp*\nDisallow: /a.b\n');
    expect(robotsAllows(r, 'x', '/docs/manual.pdf').allowed).toBe(false);
    expect(robotsAllows(r, 'x', '/docs/manual.pdf?dl=1').allowed).toBe(true);
    expect(robotsAllows(r, 'x', '/tmp-files/x').allowed).toBe(false);
    expect(robotsAllows(r, 'x', '/public/tmp').allowed).toBe(true);
    // the dot is literal
    expect(robotsAllows(r, 'x', '/a.b').allowed).toBe(false);
    expect(robotsAllows(r, 'x', '/aXb').allowed).toBe(true);
  });

  it('treats an empty Disallow as "allow all"', () => {
    const r = parseRobots('User-agent: *\nDisallow:\n');
    expect(robotsAllows(r, 'x', '/anything').allowed).toBe(true);
  });

  it('a group with only Allow rules permits everything', () => {
    const r = parseRobots('User-agent: bot\nAllow: /\n');
    expect(robotsAllows(r, 'bot', '/deep/path')).toEqual({ allowed: true, group: 'bot' });
  });
});

describe('textFromHtml', () => {
  it('strips tags, scripts, styles, noscript and comments and collapses whitespace', () => {
    const html = `<!doctype html><html><head><title>T</title>
      <style>body{color:red}</style>
      <script>var x = "<p>not text</p>";</script></head>
      <body><!-- hidden comment --><noscript>Enable JS</noscript>
      <main><h1>Hello,&nbsp;world</h1>
      <p>Returns within <strong>30</strong> days.</p></main></body></html>`;
    const text = textFromHtml(html);
    expect(text).toBe('T Hello, world Returns within 30 days.');
    expect(text).not.toContain('not text');
    expect(text).not.toContain('Enable JS');
    expect(text).not.toContain('color:red');
    expect(text).not.toContain('hidden comment');
  });

  it('returns an empty string for markup without text', () => {
    expect(textFromHtml('<div id="app"></div><script src="app.js"></script>')).toBe('');
    expect(textFromHtml('')).toBe('');
  });

  it('is case-insensitive for script/style tags and handles multi-line blocks', () => {
    expect(textFromHtml('<SCRIPT>\nalert(1)\n</SCRIPT>text<STYLE>\n.a{}\n</STYLE>')).toBe('text');
  });
});
