import { describe, hasAncestorRole, interactiveNodes } from '../browser/snapshot.js';
import type { EvidenceItem } from '../types.js';
import { type CheckDefinition, axeEvidence, axeViolations, okPages, pagesOf } from './framework.js';

export const KEY_PAGE_VOCAB: Record<string, string[]> = {
  contact: ['contact', 'contact us', 'get in touch', 'contacto', 'contactos', 'fale connosco'],
  about: ['about', 'about us', 'company', 'who we are', 'sobre', 'quem somos'],
  help: ['help', 'support', 'faq', 'faqs', 'help center', 'help centre', 'ajuda', 'suporte'],
  privacy: ['privacy', 'privacy policy', 'privacidade'],
  terms: ['terms', 'terms of service', 'terms and conditions', 'legal', 'termos'],
  search: ['search', 'pesquisar', 'procurar'],
  pricing: ['pricing', 'plans', 'preços', 'planos'],
  returns: ['returns', 'return policy', 'refund', 'refunds', 'shipping', 'devoluções', 'trocas'],
};

export function matchesVocab(name: string, words: string[]): boolean {
  const n = name.toLowerCase().replace(/\s+/g, ' ').trim();
  return words.some(
    (w) =>
      n === w ||
      n.startsWith(`${w} `) ||
      n.endsWith(` ${w}`) ||
      n.includes(` ${w} `) ||
      (w.length > 4 && n.includes(w)),
  );
}

export const navigationChecks: CheckDefinition[] = [
  {
    id: 'landmarks',
    title: 'Page regions are exposed as landmarks',
    dimension: 'navigation',
    weight: 7,
    rationale:
      'A single main landmark and a navigation landmark let an agent skip chrome and find content; agent snapshots group nodes by landmark.',
    references: [
      'WCAG 2.2 SC 1.3.1 Info and Relationships',
      'WCAG 2.2 SC 2.4.1 Bypass Blocks',
      'axe-core landmark-one-main, bypass, region',
    ],
    remediation:
      'Wrap primary content in <main>, site navigation in <nav aria-label="…">, and header/footer in <header>/<footer>.',
    run(ctx) {
      const evidence: EvidenceItem[] = [];
      let problems = 0;
      for (const p of okPages(ctx)) {
        const l = p.data.landmarks;
        if (l.main !== 1) {
          problems++;
          evidence.push({
            url: p.finalUrl,
            observed: `${l.main} main landmarks`,
            expected: 'exactly one <main>',
          });
        }
        if (l.nav === 0) {
          problems++;
          evidence.push({
            url: p.finalUrl,
            observed: 'no navigation landmark',
            expected: '<nav> around site navigation',
          });
        }
        evidence.push(...axeEvidence(p, axeViolations(p.axe, ['bypass', 'region']), 3));
      }
      const pages = okPages(ctx).length;
      return {
        status: pages === 0 ? 'na' : problems === 0 ? 'pass' : problems <= pages ? 'warn' : 'fail',
        summary:
          problems === 0
            ? 'Main and navigation landmarks present.'
            : `${problems} landmark problems across ${pages} pages.`,
        evidence,
        metrics: { problems },
        pages: pagesOf(ctx),
      };
    },
  },
  {
    id: 'navigation-links-usable',
    title: 'Navigation links are named and resolvable',
    dimension: 'navigation',
    weight: 7,
    rationale:
      'Agents prefer navigating by following named links or by URL; nav links with href="#" or javascript: cannot be followed by URL and unnamed ones cannot be chosen.',
    references: [
      'WCAG 2.2 SC 2.4.4 Link Purpose',
      'WebVoyager error analysis: navigation stuck 44%',
    ],
    remediation:
      'Use real URLs in href for navigation items; name every nav link; if JavaScript handles navigation, keep a working href as fallback.',
    run(ctx) {
      const evidence: EvidenceItem[] = [];
      let navLinks = 0;
      let bad = 0;
      for (const p of okPages(ctx)) {
        const links = interactiveNodes(p.snapshot).filter(
          (n) => n.role === 'link' && hasAncestorRole(n, 'navigation'),
        );
        for (const n of links) {
          navLinks++;
          const url = n.url ?? '';
          const unresolvable = !url || url === '#' || /^javascript:/i.test(url);
          if (!n.name || unresolvable) {
            bad++;
            if (evidence.length < 20)
              evidence.push({
                url: p.finalUrl,
                ref: n.ref,
                element: describe(n),
                observed: !n.name ? 'unnamed nav link' : `href ${url || '(empty)'}`,
                expected: 'named link with a real URL',
              });
          }
        }
        if (links.length === 0 && p.data.landmarks.nav > 0) {
          const domNav = p.data.links.filter((l) => l.inNav);
          if (domNav.length > 0) {
            bad += domNav.length;
            navLinks += domNav.length;
            evidence.push({
              url: p.finalUrl,
              observed: `${domNav.length} nav links in DOM but none exposed in the accessibility tree`,
              expected: 'nav links visible to the tree (not aria-hidden/hidden)',
              note: domNav
                .slice(0, 3)
                .map((l) => l.text || l.href)
                .join(', '),
            });
          }
        }
      }
      if (navLinks === 0) {
        const anyLinks = okPages(ctx).some((p) => p.data.links.length > 0);
        return {
          status: anyLinks ? 'warn' : 'na',
          summary: 'No links inside a navigation landmark.',
          evidence: [{ observed: 'no <nav> links', expected: 'site navigation inside <nav>' }],
          pages: pagesOf(ctx),
        };
      }
      return {
        status: bad === 0 ? 'pass' : bad / navLinks > 0.25 ? 'fail' : 'warn',
        summary:
          bad === 0
            ? `${navLinks} navigation links are named and resolvable.`
            : `${bad} of ${navLinks} navigation links are unnamed or have no real URL.`,
        evidence,
        metrics: { navLinks, bad },
        pages: pagesOf(ctx),
      };
    },
  },
  {
    id: 'hover-only-menus',
    title: 'Menus do not depend on hover',
    dimension: 'navigation',
    weight: 3,
    rationale:
      'Hover-revealed submenus are absent from the accessibility snapshot until a pointer hovers; text-first agents never see them (INFERENCE heuristic: nav links in the DOM but not in the snapshot, with no toggle button).',
    references: [
      'WCAG 2.2 SC 1.4.13 Content on Hover or Focus',
      'Agent tooling docs: hover-only menus listed as a failure mode',
    ],
    remediation:
      'Expose submenus through a <button aria-expanded> toggle, or render submenu links in the page (footer sitemap) so they are reachable without hover.',
    run(ctx) {
      const evidence: EvidenceItem[] = [];
      let hidden = 0;
      let togglable = 0;
      for (const p of okPages(ctx)) {
        const hiddenNav = p.data.links.filter((l) => l.inNav && !l.visible);
        if (hiddenNav.length === 0) continue;
        const toggles = interactiveNodes(p.snapshot).filter(
          (n) =>
            n.role === 'button' &&
            hasAncestorRole(n, 'navigation') &&
            (n.expanded !== undefined || /menu/i.test(n.name)),
        );
        if (toggles.length > 0) {
          togglable += hiddenNav.length;
          continue;
        }
        hidden += hiddenNav.length;
        evidence.push({
          url: p.finalUrl,
          observed: `${hiddenNav.length} nav links hidden until hover`,
          expected: 'submenu behind a button with aria-expanded, or always rendered',
          note: hiddenNav
            .slice(0, 4)
            .map((l) => l.text || l.href)
            .join(', '),
        });
      }
      return {
        status: hidden === 0 ? 'pass' : hidden <= 3 ? 'warn' : 'fail',
        summary:
          hidden === 0
            ? 'No hover-only navigation detected.'
            : `${hidden} navigation links are only revealed on hover.`,
        evidence,
        metrics: { hoverOnlyLinks: hidden, hiddenButTogglable: togglable },
        pages: pagesOf(ctx),
      };
    },
  },
  {
    id: 'key-pages-discoverable',
    title: 'Common destinations are discoverable from the start page',
    dimension: 'navigation',
    weight: 3,
    rationale:
      'The most common agent goals on a site (contact, help, policies, search, pricing) should be reachable through recognisably named links from the entry page.',
    references: [
      'Benchmark task archetypes (WebVoyager, Mind2Web): find contact/policy/help pages',
    ],
    remediation:
      'Link contact, help/FAQ, privacy/terms, and search from the header or footer with their conventional names.',
    run(ctx) {
      const p = ctx.start;
      if (p.error) return { status: 'na', summary: 'Start page did not load.' };
      const names = interactiveNodes(p.snapshot)
        .filter((n) => n.role === 'link' || n.role === 'button' || n.role === 'searchbox')
        .map((n) => n.name);
      if (p.data.inputTypeSearch > 0 || p.data.landmarks.search > 0) names.push('search');
      const found: string[] = [];
      const missing: string[] = [];
      for (const [k, vocab] of Object.entries(KEY_PAGE_VOCAB)) {
        if (k === 'pricing' || k === 'returns') continue;
        if (names.some((n) => matchesVocab(n, vocab))) found.push(k);
        else missing.push(k);
      }
      return {
        status: found.length >= 3 ? 'pass' : found.length >= 1 ? 'warn' : 'fail',
        summary: `Found ${found.join(', ') || 'none'}; missing ${missing.join(', ') || 'none'}.`,
        evidence: [
          {
            url: p.finalUrl,
            observed: `discoverable: ${found.join(', ') || 'none'}`,
            expected: 'contact, help, privacy/terms, about, search',
          },
        ],
        metrics: { found: found.length, missing: missing.length },
        pages: [p.finalUrl],
      };
    },
  },
  {
    id: 'search-available',
    title: 'Site search is exposed',
    dimension: 'navigation',
    weight: 1,
    rationale:
      'A labelled search box (or a schema.org SearchAction) is the fastest route for an agent to locate content on larger sites.',
    references: ['ARIA search landmark', 'schema.org WebSite potentialAction SearchAction'],
    remediation:
      'Expose search as <form role="search"> with a labelled <input type="search">, and declare a SearchAction in WebSite JSON-LD.',
    run(ctx) {
      const p = ctx.start;
      if (p.error) return { status: 'na', summary: 'Start page did not load.' };
      const hasSearchAction = p.data.jsonLd.some((j) => j.types.includes('SearchAction'));
      const searchbox = interactiveNodes(p.snapshot).some(
        (n) => n.role === 'searchbox' || (n.role === 'textbox' && /search|pesquis/i.test(n.name)),
      );
      const landmark = p.data.landmarks.search > 0 || p.data.inputTypeSearch > 0;
      const ok = hasSearchAction || searchbox || landmark;
      return {
        status: ok ? 'pass' : 'warn',
        summary: ok
          ? `Search exposed via ${[landmark && 'search landmark/input', searchbox && 'named search box', hasSearchAction && 'SearchAction'].filter(Boolean).join(', ')}.`
          : 'No search control or SearchAction found on the start page.',
        evidence: [
          {
            url: p.finalUrl,
            observed: ok ? 'search available' : 'no search found',
            expected: 'role=search form or SearchAction',
          },
        ],
        metrics: { searchAction: hasSearchAction, searchbox, landmark },
        pages: [p.finalUrl],
      };
    },
  },
  {
    id: 'sitemap',
    title: 'A sitemap is published',
    dimension: 'navigation',
    weight: 3,
    rationale:
      'Crawling agents discover pages through sitemap.xml; it is the cheapest structural map of a site.',
    references: ['sitemaps.org protocol', 'RFC 9309 Sitemap directive'],
    remediation: 'Publish /sitemap.xml and reference it with a Sitemap: line in robots.txt.',
    run(ctx) {
      const s = ctx.probes.sitemap;
      const robotsHas = /^\s*sitemap:/im.test(ctx.probes.robots.body);
      const ok = (s.ok && /<(urlset|sitemapindex)/i.test(s.body)) || robotsHas;
      return {
        status: ok ? 'pass' : 'fail',
        summary: ok
          ? `Sitemap found${robotsHas ? ' (declared in robots.txt)' : ''}.`
          : 'No sitemap.xml and no Sitemap directive in robots.txt.',
        evidence: [
          {
            url: s.url,
            observed: `HTTP ${s.status ?? 'error'}${robotsHas ? ', robots.txt Sitemap: present' : ''}`,
            expected: 'urlset/sitemapindex XML',
          },
        ],
        metrics: { status: s.status ?? -1, robotsDirective: robotsHas },
      };
    },
  },
  {
    id: 'breadcrumbs',
    title: 'Inner pages expose breadcrumbs',
    dimension: 'navigation',
    weight: 1,
    rationale:
      'Breadcrumbs tell an agent where it is in the hierarchy and how to go up; schema.org BreadcrumbList does the same for fetch-based agents.',
    references: ['WCAG 2.2 SC 2.4.8 Location', 'schema.org BreadcrumbList'],
    remediation:
      'Add <nav aria-label="Breadcrumb"> with links on inner pages and BreadcrumbList JSON-LD.',
    run(ctx) {
      // Breadcrumbs are expected on pages at least two levels deep (/section/page).
      const depth = (u: string) => new URL(u).pathname.split('/').filter(Boolean).length;
      const inner = okPages(ctx).filter((p) => depth(p.finalUrl) >= 2);
      if (inner.length === 0)
        return {
          status: 'na',
          summary: 'No pages deeper than one level were scanned; breadcrumbs not expected.',
        };
      const withCrumbs = inner.filter(
        (p) =>
          p.data.jsonLd.some((j) => j.types.includes('BreadcrumbList')) ||
          p.snapshot.nodes.some((n) => n.role === 'navigation' && /breadcrumb/i.test(n.name)),
      );
      return {
        status:
          withCrumbs.length === inner.length ? 'pass' : withCrumbs.length > 0 ? 'warn' : 'warn',
        summary: `${withCrumbs.length} of ${inner.length} inner pages have breadcrumbs.`,
        evidence: inner.map((p) => ({
          url: p.finalUrl,
          observed: withCrumbs.includes(p) ? 'breadcrumbs present' : 'no breadcrumbs',
          expected: 'breadcrumb navigation',
        })),
        metrics: { innerPages: inner.length, withBreadcrumbs: withCrumbs.length },
        pages: inner.map((p) => p.finalUrl),
      };
    },
  },
];
