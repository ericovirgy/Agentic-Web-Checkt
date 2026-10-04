/**
 * Plain HTTP probes (no browser). Used for robots.txt, sitemap, llms.txt, well-known manifests and the
 * JS-disabled HTML baseline. All requests carry the tool's honest user agent and a short timeout.
 */

export interface ProbeResult {
  url: string;
  ok: boolean;
  status: number | null;
  contentType: string;
  body: string;
  error?: string;
  ms: number;
}

export interface SiteProbes {
  robots: ProbeResult;
  sitemap: ProbeResult;
  llmsTxt: ProbeResult;
  agentCard: ProbeResult;
  ucp: ProbeResult;
  aiCatalog: ProbeResult;
  rawHtml: ProbeResult;
}

export async function probe(
  url: string,
  userAgent: string,
  opts: { maxBytes?: number; timeoutMs?: number; accept?: string } = {},
): Promise<ProbeResult> {
  const started = Date.now();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 10_000);
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': userAgent, accept: opts.accept ?? '*/*' },
      redirect: 'follow',
      signal: ctrl.signal,
    });
    const contentType = res.headers.get('content-type') ?? '';
    const buf = await res.arrayBuffer();
    const max = opts.maxBytes ?? 512_000;
    const body = new TextDecoder('utf-8', { fatal: false }).decode(buf.slice(0, max));
    return { url, ok: res.ok, status: res.status, contentType, body, ms: Date.now() - started };
  } catch (e) {
    return {
      url,
      ok: false,
      status: null,
      contentType: '',
      body: '',
      error: String((e as Error).message ?? e),
      ms: Date.now() - started,
    };
  } finally {
    clearTimeout(t);
  }
}

export async function probeSite(
  pageUrl: string,
  userAgent: string,
  log?: (m: string) => void,
): Promise<SiteProbes> {
  const origin = new URL(pageUrl).origin;
  const at = (p: string) => new URL(p, origin).toString();
  log?.('probing robots.txt, sitemap, llms.txt, well-known manifests');
  const [robots, sitemap, llmsTxt, agentCard, ucp, aiCatalog, rawHtml] = await Promise.all([
    probe(at('/robots.txt'), userAgent, { maxBytes: 200_000 }),
    probe(at('/sitemap.xml'), userAgent, { maxBytes: 50_000 }),
    probe(at('/llms.txt'), userAgent, { maxBytes: 200_000 }),
    probe(at('/.well-known/agent-card.json'), userAgent, { maxBytes: 50_000 }),
    probe(at('/.well-known/ucp'), userAgent, { maxBytes: 50_000 }),
    probe(at('/ai-catalog.json'), userAgent, { maxBytes: 50_000 }),
    probe(pageUrl, userAgent, { maxBytes: 2_000_000, accept: 'text/html,application/xhtml+xml' }),
  ]);
  return { robots, sitemap, llmsTxt, agentCard, ucp, aiCatalog, rawHtml };
}

/** Visible-text estimate from raw HTML without executing scripts. */
export function textFromHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface RobotsRules {
  groups: { agents: string[]; disallow: string[]; allow: string[] }[];
  sitemaps: string[];
  contentSignal: string | null;
}

export function parseRobots(body: string): RobotsRules {
  const groups: RobotsRules['groups'] = [];
  const sitemaps: string[] = [];
  let contentSignal: string | null = null;
  let current: RobotsRules['groups'][number] | null = null;
  let lastWasAgent = false;
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], disallow: [], allow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (key === 'sitemap') sitemaps.push(value);
    else if (key === 'content-signal') contentSignal = value;
    else if (current && key === 'disallow') current.disallow.push(value);
    else if (current && key === 'allow') current.allow.push(value);
  }
  return { groups, sitemaps, contentSignal };
}

/** RFC 9309 matching: longest-match wins, allow wins ties; group selected by most specific UA token. */
export function robotsAllows(
  rules: RobotsRules,
  agent: string,
  path: string,
): { allowed: boolean; group: string | null } {
  const a = agent.toLowerCase();
  // RFC 9309: a group applies when its product token is a case-insensitive substring of the UA.
  let group = rules.groups.find((g) => g.agents.some((t) => t !== '*' && a.includes(t)));
  let groupName = group?.agents.join(',') ?? null;
  if (!group) {
    group = rules.groups.find((g) => g.agents.includes('*'));
    groupName = group ? '*' : null;
  }
  if (!group) return { allowed: true, group: null };
  const match = (pattern: string): number => {
    if (!pattern) return -1;
    const re = new RegExp(
      `^${pattern
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\\\$$/, '$')}`,
    );
    return re.test(path) ? pattern.length : -1;
  };
  const bestAllow = Math.max(-1, ...group.allow.map(match));
  const bestDisallow = Math.max(-1, ...group.disallow.map(match));
  if (bestDisallow < 0) return { allowed: true, group: groupName };
  return { allowed: bestAllow >= bestDisallow, group: groupName };
}
