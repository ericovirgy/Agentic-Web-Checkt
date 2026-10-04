import { parseRobots, robotsAllows, textFromHtml } from '../browser/probes.js';
import type { EvidenceItem } from '../types.js';
import { type CheckDefinition, okPages, pagesOf } from './framework.js';

/** User-triggered agent fetchers (not training crawlers). See docs/research/02 §12. */
export const USER_TRIGGERED_AGENTS = [
  'ChatGPT-User',
  'Claude-User',
  'OAI-SearchBot',
  'Claude-SearchBot',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Agent',
];
export const TRAINING_CRAWLERS = [
  'GPTBot',
  'ClaudeBot',
  'Google-Extended',
  'CCBot',
  'Bytespider',
  'Applebot-Extended',
  'meta-externalagent',
];

const RELEVANT_TYPES = [
  'Organization',
  'WebSite',
  'WebPage',
  'Product',
  'Offer',
  'FAQPage',
  'ContactPoint',
  'BreadcrumbList',
  'Article',
  'LocalBusiness',
  'Event',
  'HowTo',
  'SearchAction',
  'ItemList',
  'Service',
  'SoftwareApplication',
];

export const machineChecks: CheckDefinition[] = [
  {
    id: 'robots-agent-access',
    title: 'robots.txt lets user-triggered agents fetch the page',
    dimension: 'machine-interfaces',
    weight: 7,
    rationale:
      'User-triggered agent fetchers (ChatGPT-User, Claude-User, search bots) honour robots.txt; disallowing them makes the site unusable to those agents regardless of its UI. Training crawler policy is a separate owner choice and is reported as info.',
    references: [
      'RFC 9309 Robots Exclusion Protocol',
      'OpenAI/Anthropic/Perplexity crawler documentation (research/02 §12)',
      'Cloudflare Content-Signal robots.txt extension',
    ],
    remediation:
      'Allow the user-triggered agent tokens (or at least * for public pages). Keep training-crawler rules separate: User-agent: GPTBot / ClaudeBot groups.',
    run(ctx) {
      const r = ctx.probes.robots;
      const path = new URL(ctx.start.finalUrl || ctx.options.url).pathname || '/';
      if (!r.ok || r.status === 404)
        return {
          status: 'pass',
          summary: 'No robots.txt (everything allowed by default).',
          evidence: [
            {
              url: r.url,
              observed: `HTTP ${r.status ?? 'error'}`,
              expected: 'robots.txt optional',
            },
          ],
          metrics: { present: false },
        };
      const rules = parseRobots(r.body);
      const star = robotsAllows(rules, 'AgenticWebCheck', path);
      const agents = USER_TRIGGERED_AGENTS.map((a) => ({
        agent: a,
        ...robotsAllows(rules, a, path),
      }));
      const trainers = TRAINING_CRAWLERS.map((a) => ({
        agent: a,
        ...robotsAllows(rules, a, path),
      }));
      const blockedAgents = agents.filter((a) => !a.allowed);
      const evidence: EvidenceItem[] = [
        {
          url: r.url,
          observed: `* ${star.allowed ? 'allowed' : 'disallowed'} for ${path}`,
          expected: 'allowed',
        },
        {
          observed: `user-triggered agents blocked: ${blockedAgents.map((a) => a.agent).join(', ') || 'none'}`,
          expected: 'none blocked',
        },
        {
          observed: `training crawlers blocked: ${
            trainers
              .filter((t) => !t.allowed)
              .map((t) => t.agent)
              .join(', ') || 'none'
          }`,
          note: "informational: training policy is the owner's choice",
        },
      ];
      if (rules.contentSignal)
        evidence.push({
          observed: `Content-Signal: ${rules.contentSignal}`,
          note: 'Cloudflare content signals present',
        });
      const status = !star.allowed
        ? 'fail'
        : blockedAgents.length === agents.length
          ? 'fail'
          : blockedAgents.length > 0
            ? 'warn'
            : 'pass';
      return {
        status,
        summary: !star.allowed
          ? `robots.txt disallows ${path} for all agents.`
          : blockedAgents.length
            ? `${blockedAgents.length} of ${agents.length} user-triggered agent tokens are disallowed.`
            : 'User-triggered agents may fetch this page.',
        evidence,
        metrics: {
          present: true,
          starAllowed: star.allowed,
          blockedUserAgents: blockedAgents.length,
          blockedTrainers: trainers.filter((t) => !t.allowed).length,
          contentSignal: rules.contentSignal ?? '',
        },
      };
    },
  },
  {
    id: 'server-rendered-content',
    title: 'Content is available without executing JavaScript',
    dimension: 'machine-interfaces',
    weight: 7,
    rationale:
      'Fetch-based agents and most AI crawlers read the HTML response without running scripts (INFERENCE from vendor documentation); a client-only app is empty to them.',
    references: [
      'Vendor crawler documentation (research/02)',
      'Lighthouse agentic-browsing rationale',
    ],
    remediation:
      'Server-render or pre-render the primary content; keep key text, links and forms in the initial HTML.',
    run(ctx) {
      const raw = ctx.probes.rawHtml;
      const p = ctx.start;
      if (p.error) return { status: 'na', summary: 'Start page did not load.' };
      if (!raw.ok)
        return {
          status: 'warn',
          summary: `Plain HTTP fetch of the page failed (HTTP ${raw.status ?? 'error'}), see challenge-or-bot-wall.`,
          evidence: [
            {
              url: raw.url,
              observed: raw.error ?? `HTTP ${raw.status}`,
              expected: '200 with HTML',
            },
          ],
        };
      const rawText = textFromHtml(raw.body).length;
      const rendered = Math.max(p.data.textLength, 1);
      const ratio = rawText / rendered;
      const evidence: EvidenceItem[] = [
        {
          url: p.finalUrl,
          observed: `${rawText} chars of text in raw HTML vs ${p.data.textLength} rendered (${Math.round(ratio * 100)}%)`,
          expected: '≥ 50% of the rendered text present in HTML',
        },
      ];
      return {
        status: ratio >= 0.5 || p.data.textLength < 200 ? 'pass' : ratio >= 0.2 ? 'warn' : 'fail',
        summary: `${Math.round(Math.min(ratio, 1) * 100)}% of rendered text is present without JavaScript.`,
        evidence,
        metrics: {
          rawTextChars: rawText,
          renderedTextChars: p.data.textLength,
          ratio: Math.round(ratio * 100) / 100,
        },
        pages: [p.finalUrl],
      };
    },
  },
  {
    id: 'structured-data',
    title: 'Structured data (JSON-LD) describes the page',
    dimension: 'machine-interfaces',
    weight: 3,
    rationale:
      'schema.org JSON-LD gives fetch-based agents entities (organisation, products, offers, contact points, FAQs) without parsing the layout.',
    references: ['schema.org', 'Google structured data guidelines'],
    remediation:
      'Add JSON-LD for Organization/WebSite on the home page and Product/Offer, FAQPage, ContactPoint or BreadcrumbList on inner pages.',
    run(ctx) {
      const evidence: EvidenceItem[] = [];
      let blocks = 0;
      let invalid = 0;
      const types = new Set<string>();
      for (const p of okPages(ctx)) {
        for (const j of p.data.jsonLd) {
          blocks++;
          if (!j.valid) {
            invalid++;
            evidence.push({
              url: p.finalUrl,
              observed: 'invalid JSON-LD block',
              expected: 'parseable JSON',
              note: j.raw.slice(0, 80),
            });
          }
          for (const t of j.types) types.add(t);
        }
      }
      const relevant = [...types].filter((t) => RELEVANT_TYPES.includes(t));
      evidence.unshift({
        observed: `types: ${[...types].join(', ') || 'none'}`,
        expected: RELEVANT_TYPES.slice(0, 6).join(', '),
      });
      return {
        status:
          blocks === 0 ? 'fail' : invalid > 0 ? 'warn' : relevant.length > 0 ? 'pass' : 'warn',
        summary:
          blocks === 0
            ? 'No JSON-LD found.'
            : `${blocks} JSON-LD blocks (${invalid} invalid), relevant types: ${relevant.join(', ') || 'none'}.`,
        evidence,
        metrics: { blocks, invalid, relevantTypes: relevant.length },
        pages: pagesOf(ctx),
      };
    },
  },
  {
    id: 'llms-txt',
    title: 'llms.txt is published and well-formed',
    dimension: 'machine-interfaces',
    weight: 3,
    rationale:
      'llms.txt is a proposed index of a site for language models. Publication is cheap and checked by Lighthouse; actual consumption by agents is UNVERIFIED (Ahrefs: 97% of files get no requests), hence the low weight.',
    references: [
      'llmstxt.org specification',
      'Lighthouse llms-txt audit',
      'research/02 §10 adoption evidence',
    ],
    remediation:
      'Publish /llms.txt with an H1, a one-paragraph blockquote and H2 sections of markdown links to the most useful pages.',
    run(ctx) {
      const l = ctx.probes.llmsTxt;
      if (!l.ok || (/text\/html/i.test(l.contentType) && /<html/i.test(l.body)))
        return {
          status: 'warn',
          summary: 'No llms.txt published.',
          evidence: [
            {
              url: l.url,
              observed: `HTTP ${l.status ?? 'error'}`,
              expected: 'markdown file with H1',
            },
          ],
          metrics: { present: false },
        };
      const hasH1 = /^#\s+\S/m.test(l.body);
      const links = (l.body.match(/\[[^\]]+\]\([^)]+\)/g) ?? []).length;
      const ok = hasH1 && links >= 1;
      return {
        status: ok ? 'pass' : 'warn',
        summary: ok
          ? `llms.txt published with ${links} links (agent usage not verified).`
          : 'llms.txt present but missing an H1 or markdown links.',
        evidence: [
          {
            url: l.url,
            observed: `H1: ${hasH1}, links: ${links}, ${l.body.length} bytes`,
            expected: 'H1 + markdown link list',
          },
        ],
        metrics: { present: true, h1: hasH1, links },
      };
    },
  },
  {
    id: 'webmcp',
    title: 'WebMCP tools are exposed',
    dimension: 'machine-interfaces',
    weight: 3,
    rationale:
      'WebMCP (W3C WebML Community Group draft, Chrome origin trial) lets a page register typed tools for agents. It is early, so absence is informational; presence is a strong signal of agent intent.',
    references: [
      'W3C WebML CG WebMCP explainer/spec (document.modelContext.registerTool, form[toolname])',
      'Lighthouse webmcp-registered-tools / webmcp-form-coverage',
    ],
    remediation:
      'Optional: register tools via document.modelContext.registerTool({ name, description, inputSchema, execute, annotations }) or annotate forms with toolname/tooldescription.',
    run(ctx) {
      const evidence: EvidenceItem[] = [];
      let imperative = 0;
      let declarative = 0;
      let polyfill = false;
      for (const p of okPages(ctx)) {
        const w = p.data.webmcp;
        imperative += w.tools.length;
        declarative += w.declarativeForms;
        polyfill = polyfill || w.polyfillFingerprint;
        for (const t of w.tools.slice(0, 10))
          evidence.push({
            url: p.finalUrl,
            element: `tool ${t.name}`,
            observed: `${t.description.slice(0, 80)} (via ${t.via}${t.annotations ? `, annotations ${JSON.stringify(t.annotations)}` : ''})`,
            expected: 'name, description, inputSchema, execute',
          });
        if (w.declarativeForms)
          evidence.push({
            url: p.finalUrl,
            observed: `${w.declarativeForms} declarative tool forms (form[toolname])`,
          });
      }
      const total = imperative + declarative;
      if (total === 0)
        return {
          status: 'info',
          summary: `No WebMCP tools detected${polyfill ? ' (polyfill fingerprint present)' : ''}.`,
          evidence: [
            {
              observed: 'no document.modelContext.registerTool calls, no form[toolname]',
              note: 'WebMCP is an origin trial; absence is not penalised',
            },
          ],
          metrics: { tools: 0, declarativeForms: 0, polyfill },
        };
      return {
        status: 'pass',
        summary: `${imperative} registered tools and ${declarative} declarative tool forms.`,
        evidence,
        metrics: { tools: imperative, declarativeForms: declarative, polyfill },
        pages: pagesOf(ctx),
      };
    },
  },
  {
    id: 'agent-manifests',
    title: 'Agent manifests (agent-card, UCP, ARD) are published',
    dimension: 'machine-interfaces',
    weight: 1,
    rationale:
      'Emerging discovery files: A2A agent-card.json, Universal Commerce Protocol /.well-known/ucp, Agentic Resource Discovery ai-catalog.json. All are early; presence is informational.',
    references: [
      'A2A protocol agent card',
      'UCP (Google/Shopify) /.well-known/ucp',
      'Lighthouse ard-schema audit',
    ],
    remediation:
      'Optional: publish the manifest relevant to your domain (commerce: UCP; agent services: A2A agent card).',
    run(ctx) {
      const found: string[] = [];
      const evidence: EvidenceItem[] = [];
      const isJson = (b: string) => {
        try {
          JSON.parse(b);
          return true;
        } catch {
          return false;
        }
      };
      for (const [name, pr] of [
        ['agent-card.json', ctx.probes.agentCard],
        ['ucp', ctx.probes.ucp],
        ['ai-catalog.json', ctx.probes.aiCatalog],
      ] as const) {
        const ok = pr.ok && isJson(pr.body);
        if (ok) found.push(name);
        evidence.push({
          url: pr.url,
          observed: ok ? 'valid JSON' : `HTTP ${pr.status ?? 'error'}`,
          expected: 'optional JSON manifest',
        });
      }
      return {
        status: found.length ? 'pass' : 'info',
        summary: found.length ? `Found ${found.join(', ')}.` : 'No agent manifests (optional).',
        evidence,
        metrics: { found: found.length },
      };
    },
  },
];
