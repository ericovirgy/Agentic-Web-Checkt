import { NAME_REQUIRED_ROLES, describe, interactiveNodes } from '../browser/snapshot.js';
import type { EvidenceItem } from '../types.js';
import {
  type CheckDefinition,
  axeEvidence,
  axeRan,
  axeViolations,
  okPages,
  pagesOf,
  pct,
  ratioStatus,
} from './framework.js';

const GENERIC_NAMES = new Set([
  'click here',
  'here',
  'read more',
  'learn more',
  'more',
  'link',
  'button',
  'submit',
  'go',
  'this',
  'details',
  'view',
  'see more',
  'continue',
  'next',
  'ler mais',
  'saber mais',
  'clique aqui',
  'aqui',
]);

export const perceptionChecks: CheckDefinition[] = [
  {
    id: 'control-accessible-name',
    title: 'Interactive controls have accessible names',
    dimension: 'perception',
    weight: 10,
    rationale:
      'Accessibility-tree agents (Playwright MCP, Chrome DevTools MCP, agent-browser) select controls by role and accessible name; an unnamed control is unselectable and grounding errors are a top failure cause in WebVoyager/Online-Mind2Web.',
    references: [
      'WCAG 2.2 SC 4.1.2 Name, Role, Value',
      'Lighthouse agent-accessibility-tree (button-name, link-name, label, select-name)',
    ],
    remediation:
      'Give every button, link and form control a visible text label or an aria-label/aria-labelledby. For icon buttons use aria-label; for inputs use <label for>.',
    run(ctx) {
      let total = 0;
      let unnamed = 0;
      const evidence: EvidenceItem[] = [];
      for (const p of okPages(ctx)) {
        for (const n of interactiveNodes(p.snapshot)) {
          if (!NAME_REQUIRED_ROLES.has(n.role)) continue;
          total++;
          if (!n.name) {
            unnamed++;
            if (evidence.length < 20)
              evidence.push({
                url: p.finalUrl,
                ref: n.ref,
                element: describe(n),
                observed: 'no accessible name',
                expected: `${n.role} with a name`,
              });
          }
        }
      }
      const status = ratioStatus(unnamed, total, 0.02, 0.1);
      return {
        status,
        summary:
          total === 0
            ? 'No interactive controls found in the accessibility tree.'
            : `${unnamed} of ${total} interactive controls (${pct(unnamed, total)}) have no accessible name.`,
        evidence,
        metrics: { interactive: total, unnamed },
        pages: pagesOf(ctx),
      };
    },
  },
  {
    id: 'fake-interactive-elements',
    title: 'Clickable elements are real controls, not generic elements',
    dimension: 'perception',
    weight: 7,
    rationale:
      'A div/span with a click handler appears in the accessibility tree as "generic" (at best with cursor=pointer). Tree-based agents list controls by role, so such elements are invisible or ambiguous to them.',
    references: [
      'WCAG 2.2 SC 4.1.2',
      'Playwright aria snapshot [cursor=pointer] marker',
      'agent-browser interactive-role filter',
    ],
    remediation:
      'Use <button> or <a href> for actions and navigation. If a custom element must stay, add role="button", tabindex="0", a name and keyboard handlers.',
    run(ctx) {
      let real = 0;
      let fake = 0;
      const evidence: EvidenceItem[] = [];
      for (const p of okPages(ctx)) {
        real += interactiveNodes(p.snapshot).length;
        const generics = p.snapshot.nodes.filter(
          (n) => n.role === 'generic' && n.cursor === 'pointer' && n.ref,
        );
        const dom = p.data.nonSemanticClickables;
        const count = Math.max(generics.length, dom.length);
        fake += count;
        for (const g of generics.slice(0, 8))
          evidence.push({
            url: p.finalUrl,
            ref: g.ref,
            element: describe(g),
            observed: 'generic element with pointer cursor',
            expected: 'button or link role',
          });
        for (const d of dom.slice(0, 8))
          if (evidence.length < 20)
            evidence.push({
              url: p.finalUrl,
              selector: d.selector,
              element: `<${d.tag}> "${d.text}"`,
              observed: d.reason,
              expected: 'semantic control',
            });
      }
      const total = real + fake;
      const status = ratioStatus(fake, total, 0.05, 0.25);
      return {
        status,
        summary:
          fake === 0
            ? 'All clickable elements expose a control role.'
            : `${fake} clickable elements without a control role (${pct(fake, total)} of clickables).`,
        evidence,
        metrics: { semanticControls: real, nonSemanticClickables: fake },
        pages: pagesOf(ctx),
      };
    },
  },
  {
    id: 'aria-validity',
    title: 'ARIA attributes and roles are valid',
    dimension: 'perception',
    weight: 7,
    rationale:
      "Invalid ARIA produces a misleading tree: wrong roles, missing required children, hidden-but-focusable nodes. Lighthouse's agent tree audit fails on these rules.",
    references: [
      'WCAG 2.2 SC 4.1.2',
      'axe-core aria-* rules',
      'Lighthouse agent-accessibility-tree',
    ],
    remediation:
      'Fix the reported ARIA usage: valid roles, required attributes/children, no aria-hidden on focusable content.',
    run(ctx) {
      if (!axeRan(ctx)) return { status: 'na', summary: 'axe-core did not run.' };
      const rules = [
        'aria-allowed-attr',
        'aria-required-attr',
        'aria-required-children',
        'aria-required-parent',
        'aria-roles',
        'aria-valid-attr',
        'aria-valid-attr-value',
        'aria-hidden-body',
        'aria-hidden-focus',
        'aria-prohibited-attr',
        'duplicate-id-aria',
        'nested-interactive',
        'presentation-role-conflict',
      ];
      let nodes = 0;
      const evidence: EvidenceItem[] = [];
      for (const p of okPages(ctx)) {
        const v = axeViolations(p.axe, rules);
        nodes += v.reduce((a, r) => a + r.nodes.length, 0);
        evidence.push(...axeEvidence(p, v, 8));
      }
      return {
        status: nodes === 0 ? 'pass' : nodes <= 2 ? 'warn' : 'fail',
        summary:
          nodes === 0 ? 'No ARIA validity violations.' : `${nodes} ARIA validity violations.`,
        evidence: evidence.slice(0, 20),
        metrics: { violations: nodes },
        pages: pagesOf(ctx),
      };
    },
  },
  {
    id: 'ambiguous-control-names',
    title: 'Control names are specific, not repeated or generic',
    dimension: 'perception',
    weight: 3,
    rationale:
      'Several links named "Read more" leading to different pages, or buttons all named "Submit", force an agent to guess; benchmarks attribute many wrong clicks to such ambiguity.',
    references: [
      'WCAG 2.2 SC 2.4.4 Link Purpose (In Context)',
      'WCAG 2.2 SC 2.4.9 Link Purpose (Link Only)',
    ],
    remediation:
      'Make link and button text describe the destination or action ("Read the return policy", "Add Trail Bike to cart"). Avoid "Click here"/"Read more"; use aria-label to disambiguate when visual text must stay short.',
    run(ctx) {
      const evidence: EvidenceItem[] = [];
      let generic = 0;
      let duplicates = 0;
      let total = 0;
      for (const p of okPages(ctx)) {
        const byName = new Map<string, Set<string>>();
        for (const n of interactiveNodes(p.snapshot)) {
          if (n.role !== 'link' && n.role !== 'button') continue;
          if (!n.name) continue;
          total++;
          const key = n.name.toLowerCase().replace(/\s+/g, ' ').trim();
          if (GENERIC_NAMES.has(key)) {
            generic++;
            if (evidence.length < 20)
              evidence.push({
                url: p.finalUrl,
                ref: n.ref,
                element: describe(n),
                observed: 'generic name',
                expected: 'name describing destination or action',
              });
          }
          if (n.role === 'link') {
            const target = n.url ?? '';
            const set = byName.get(key) ?? new Set<string>();
            set.add(target);
            byName.set(key, set);
          }
        }
        for (const [name, targets] of byName) {
          if (targets.size > 1) {
            duplicates++;
            if (evidence.length < 20)
              evidence.push({
                url: p.finalUrl,
                element: `link "${name}"`,
                observed: `same name points to ${targets.size} different URLs`,
                expected: 'distinct names for distinct destinations',
                note: [...targets].slice(0, 3).join(' | '),
              });
          }
        }
      }
      const bad = generic + duplicates;
      return {
        status: total === 0 ? 'na' : bad === 0 ? 'pass' : bad <= 2 ? 'warn' : 'fail',
        summary:
          bad === 0
            ? 'Control names are specific.'
            : `${generic} generic names and ${duplicates} names reused for different destinations.`,
        evidence,
        metrics: { controls: total, generic, duplicateNames: duplicates },
        pages: pagesOf(ctx),
      };
    },
  },
  {
    id: 'label-in-name',
    title: 'Visible labels are part of accessible names',
    dimension: 'perception',
    weight: 3,
    rationale:
      'Vision-based agents read the visible label and tree-based agents read the accessible name; when they differ, agents fail to agree on which control to use.',
    references: ['WCAG 2.2 SC 2.5.3 Label in Name', 'axe-core label-content-name-mismatch'],
    remediation:
      'Ensure the accessible name (aria-label) contains the visible text of the control.',
    run(ctx) {
      if (!axeRan(ctx)) return { status: 'na', summary: 'axe-core did not run.' };
      const evidence: EvidenceItem[] = [];
      let n = 0;
      for (const p of okPages(ctx)) {
        const v = axeViolations(p.axe, ['label-content-name-mismatch']);
        n += v.reduce((a, r) => a + r.nodes.length, 0);
        evidence.push(...axeEvidence(p, v, 8));
      }
      return {
        status: n === 0 ? 'pass' : n <= 2 ? 'warn' : 'fail',
        summary:
          n === 0
            ? 'Visible labels match accessible names.'
            : `${n} controls whose accessible name does not contain their visible label.`,
        evidence,
        metrics: { mismatches: n },
        pages: pagesOf(ctx),
      };
    },
  },
  {
    id: 'document-title-lang',
    title: 'Pages have a descriptive title and a language',
    dimension: 'perception',
    weight: 3,
    rationale:
      'Agents use the title to confirm navigation succeeded and the language to interpret content; generic titles ("Home") make URL/title-based verification unreliable.',
    references: [
      'WCAG 2.2 SC 2.4.2 Page Titled',
      'WCAG 2.2 SC 3.1.1 Language of Page',
      'Lighthouse document-title, html-has-lang',
    ],
    remediation:
      'Set a unique, descriptive <title> per page ("Return policy – Northwind Bikes") and <html lang="…">.',
    run(ctx) {
      const evidence: EvidenceItem[] = [];
      let problems = 0;
      const generic = new Set([
        'home',
        'index',
        'untitled',
        'document',
        'page',
        'welcome',
        'homepage',
        'new page',
      ]);
      for (const p of okPages(ctx)) {
        const title = p.data.title.trim();
        const host = new URL(p.finalUrl).hostname.replace(/^www\./, '');
        const t = title.toLowerCase();
        if (!title) {
          problems++;
          evidence.push({
            url: p.finalUrl,
            observed: 'empty <title>',
            expected: 'descriptive title',
          });
        } else if (generic.has(t) || t === host || t === host.split('.')[0]) {
          problems++;
          evidence.push({
            url: p.finalUrl,
            observed: `title "${title}"`,
            expected: 'descriptive, page-specific title',
          });
        }
        if (!p.data.lang) {
          problems++;
          evidence.push({
            url: p.finalUrl,
            observed: 'missing <html lang>',
            expected: 'lang attribute (e.g. lang="en")',
          });
        }
      }
      const pages = okPages(ctx).length;
      return {
        status: pages === 0 ? 'na' : problems === 0 ? 'pass' : problems <= pages ? 'warn' : 'fail',
        summary:
          problems === 0
            ? 'Titles and language are set.'
            : `${problems} title/language problems across ${pages} pages.`,
        evidence,
        metrics: { problems },
        pages: pagesOf(ctx),
      };
    },
  },
  {
    id: 'heading-structure',
    title: 'Headings form a usable outline',
    dimension: 'perception',
    weight: 3,
    rationale:
      'Agents and screen readers navigate by headings; a missing h1 or skipped levels hide the page structure.',
    references: [
      'WCAG 2.2 SC 2.4.6 Headings and Labels',
      'WCAG 2.2 SC 1.3.1',
      'axe-core page-has-heading-one, heading-order, empty-heading',
    ],
    remediation:
      'One h1 per page naming the page; nest h2/h3 without skipping levels; no empty headings.',
    run(ctx) {
      const evidence: EvidenceItem[] = [];
      let problems = 0;
      for (const p of okPages(ctx)) {
        const hs = p.data.headings;
        if (!hs.some((h) => h.level === 1)) {
          problems++;
          evidence.push({ url: p.finalUrl, observed: 'no h1', expected: 'one h1 naming the page' });
        }
        let prev = 0;
        for (const h of hs) {
          if (prev && h.level > prev + 1) {
            problems++;
            if (evidence.length < 20)
              evidence.push({
                url: p.finalUrl,
                element: `h${h.level} "${h.text}"`,
                observed: `skips from h${prev} to h${h.level}`,
                expected: 'no skipped heading levels',
              });
            break;
          }
          if (!h.text) {
            problems++;
            if (evidence.length < 20)
              evidence.push({
                url: p.finalUrl,
                element: `h${h.level}`,
                observed: 'empty heading',
                expected: 'heading text',
              });
          }
          prev = h.level;
        }
        const v = axeViolations(p.axe, ['page-has-heading-one', 'heading-order', 'empty-heading']);
        if (v.length && evidence.length < 20) evidence.push(...axeEvidence(p, v, 3));
      }
      const pages = okPages(ctx).length;
      return {
        status: pages === 0 ? 'na' : problems === 0 ? 'pass' : problems <= pages ? 'warn' : 'fail',
        summary:
          problems === 0
            ? 'Heading outline is sound.'
            : `${problems} heading problems across ${pages} pages.`,
        evidence,
        metrics: { problems },
        pages: pagesOf(ctx),
      };
    },
  },
  {
    id: 'image-alt',
    title: 'Images carry alternative text',
    dimension: 'perception',
    weight: 3,
    rationale:
      'Tree-based agents only know an image by its alt text; images inside links/buttons without alt leave the control unnamed.',
    references: ['WCAG 2.2 SC 1.1.1 Non-text Content', 'Lighthouse image-alt'],
    remediation:
      'Add alt text to informative images (alt="" for decorative ones); name SVG icons with aria-label or <title>.',
    run(ctx) {
      if (!axeRan(ctx)) return { status: 'na', summary: 'axe-core did not run.' };
      const evidence: EvidenceItem[] = [];
      let n = 0;
      for (const p of okPages(ctx)) {
        const v = axeViolations(p.axe, [
          'image-alt',
          'svg-img-alt',
          'role-img-alt',
          'input-image-alt',
        ]);
        n += v.reduce((a, r) => a + r.nodes.length, 0);
        evidence.push(...axeEvidence(p, v, 8));
      }
      return {
        status: n === 0 ? 'pass' : n <= 3 ? 'warn' : 'fail',
        summary:
          n === 0 ? 'Images have alternative text.' : `${n} images without alternative text.`,
        evidence,
        metrics: { missingAlt: n },
        pages: pagesOf(ctx),
      };
    },
  },
  {
    id: 'snapshot-budget',
    title: 'Accessibility snapshot fits an agent context budget',
    dimension: 'perception',
    weight: 3,
    rationale:
      'Agent harnesses truncate or reject very large accessibility trees; pages above roughly 10k tokens are partially invisible to the agent.',
    references: [
      'Playwright MCP / agent-browser snapshot filtering docs',
      'INFERENCE: thresholds 40k/100k chars',
    ],
    remediation:
      'Reduce DOM size on key pages: paginate long lists, lazy-render off-screen sections, remove duplicated hidden menus.',
    run(ctx) {
      const evidence: EvidenceItem[] = [];
      let worst = 0;
      for (const p of okPages(ctx)) {
        worst = Math.max(worst, p.snapshot.chars);
        evidence.push({
          url: p.finalUrl,
          observed: `${p.snapshot.chars} chars, ${p.snapshot.nodes.length} nodes`,
          expected: '< 40,000 chars',
        });
      }
      return {
        status:
          okPages(ctx).length === 0
            ? 'na'
            : worst < 40_000
              ? 'pass'
              : worst < 100_000
                ? 'warn'
                : 'fail',
        summary: `Largest snapshot: ${worst.toLocaleString('en-US')} chars.`,
        evidence,
        metrics: { maxSnapshotChars: worst },
        pages: pagesOf(ctx),
      };
    },
  },
];
