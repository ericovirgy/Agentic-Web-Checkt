import { describe, interactiveNodes } from '../browser/snapshot.js';
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

export const interactionChecks: CheckDefinition[] = [
  {
    id: 'form-fields-labelled',
    title: 'Form fields have labels and names',
    dimension: 'interaction',
    weight: 10,
    rationale:
      'Agents fill forms by matching field labels to the data they hold; unlabelled fields force guessing and write tasks already succeed far less often than read tasks in benchmarks.',
    references: [
      'WCAG 2.2 SC 3.3.2 Labels or Instructions',
      'WCAG 2.2 SC 4.1.2',
      'Lighthouse label, select-name',
      'Web Bench: write tasks 46.6% vs read >70%',
    ],
    remediation:
      'Associate every input/select/textarea with a <label for>, give fields a name attribute, and use autocomplete tokens for common data.',
    run(ctx) {
      if (!axeRan(ctx)) return { status: 'na', summary: 'axe-core did not run.' };
      const evidence: EvidenceItem[] = [];
      let violations = 0;
      let fields = 0;
      let unnamed = 0;
      for (const p of okPages(ctx)) {
        const v = axeViolations(p.axe, [
          'label',
          'select-name',
          'form-field-multiple-labels',
          'autocomplete-valid',
          'aria-input-field-name',
          'aria-toggle-field-name',
        ]);
        violations += v.reduce((a, r) => a + r.nodes.length, 0);
        evidence.push(...axeEvidence(p, v, 8));
        fields += p.data.looseFields.count;
        unnamed += p.data.looseFields.unnamed;
        if (p.data.looseFields.unnamed > 0 && evidence.length < 20)
          evidence.push({
            url: p.finalUrl,
            observed: `${p.data.looseFields.unnamed} fields outside any <form> without a name attribute`,
            expected: 'fields inside a <form> with name attributes',
          });
        for (const f of p.data.forms) {
          fields += f.fieldCount;
          unnamed += f.unnamedFields;
          if (f.unnamedFields > 0 && evidence.length < 20)
            evidence.push({
              url: p.finalUrl,
              selector: f.selector,
              observed: `${f.unnamedFields} fields without name attribute`,
              expected: 'name on every field',
            });
        }
      }
      if (fields === 0 && violations === 0)
        return { status: 'na', summary: 'No form fields on the scanned pages.' };
      const bad = violations + unnamed;
      return {
        status: ratioStatus(bad, Math.max(fields, bad), 0.05, 0.3),
        summary:
          bad === 0
            ? `${fields} form fields are labelled and named.`
            : `${violations} label violations and ${unnamed} unnamed fields (${pct(bad, Math.max(fields, bad))}).`,
        evidence: evidence.slice(0, 20),
        metrics: { fields, labelViolations: violations, unnamedFields: unnamed },
        pages: pagesOf(ctx),
      };
    },
  },
  {
    id: 'overlay-interference',
    title: 'No overlay blocks the page at load',
    dimension: 'interaction',
    weight: 10,
    rationale:
      'Consent banners and modals intercept clicks; agents whose click lands on the overlay loop or fail. A dismiss control with a clear name is the minimum for recovery.',
    references: [
      'agent-browser README: clicks fail under consent banners',
      'BrowserArena / GUI-Robust: pop-up and cookie-consent anomalies',
    ],
    remediation:
      'Avoid full-page overlays at load; if a consent dialog is required, make it a role="dialog" with a clearly named Accept/Reject button and let the rest of the page work beneath it.',
    run(ctx) {
      const evidence: EvidenceItem[] = [];
      let blocking = 0;
      let dismissable = 0;
      for (const p of okPages(ctx)) {
        for (const o of p.data.overlays) {
          const strong = o.coverage >= 0.3 || (o.coversCenter === 1 && o.coverage >= 0.1);
          if (!strong) continue;
          if (o.dismissControls.length > 0) {
            dismissable++;
            evidence.push({
              url: p.finalUrl,
              selector: o.selector,
              observed: `overlay covering ${Math.round(o.coverage * 100)}% with dismiss control "${o.dismissControls[0]}"`,
              expected: 'no blocking overlay',
              note: o.textSample.slice(0, 100),
            });
          } else {
            blocking++;
            evidence.push({
              url: p.finalUrl,
              selector: o.selector,
              observed: `overlay covering ${Math.round(o.coverage * 100)}% of the viewport with no named dismiss control`,
              expected: 'named Accept/Close/Reject button',
              note: o.textSample.slice(0, 100),
            });
          }
        }
      }
      return {
        status: blocking > 0 ? 'fail' : dismissable > 0 ? 'warn' : 'pass',
        summary:
          blocking > 0
            ? `${blocking} overlays block the page without an accessible dismiss control.`
            : dismissable > 0
              ? `${dismissable} overlays at load, each with a named dismiss control.`
              : 'No blocking overlays at load.',
        evidence,
        metrics: { blocking, dismissable },
        pages: pagesOf(ctx),
      };
    },
  },
  {
    id: 'native-controls',
    title: 'Controls are native or complete ARIA widgets',
    dimension: 'interaction',
    weight: 7,
    rationale:
      'Custom sliders, date pickers, drag-and-drop and div-based dropdowns are the controls agents fail on most (WILBUR, WebGames); native inputs are operable through standard actions.',
    references: [
      'WAI-ARIA Authoring Practices',
      'WebGames / WILBUR failure analyses: sliders, date pickers, drag-drop',
    ],
    remediation:
      'Prefer native <select>, <input type="date|range|number">; when custom widgets are unavoidable, implement the full ARIA pattern (roles, states such as aria-valuenow/aria-expanded, keyboard support).',
    run(ctx) {
      const evidence: EvidenceItem[] = [];
      let custom = 0;
      let drag = 0;
      let total = 0;
      for (const p of okPages(ctx)) {
        total += interactiveNodes(p.snapshot).length;
        custom += p.data.customWidgets.length;
        drag += p.data.draggables;
        for (const w of p.data.customWidgets.slice(0, 6))
          evidence.push({
            url: p.finalUrl,
            selector: w.selector,
            element: `role=${w.role}`,
            observed: w.reason,
            expected: 'native control or complete ARIA pattern',
          });
        if (p.data.draggables > 0)
          evidence.push({
            url: p.finalUrl,
            observed: `${p.data.draggables} draggable elements`,
            expected: 'keyboard/click alternative to drag-and-drop',
          });
      }
      const bad = custom + drag;
      if (total === 0 && bad === 0)
        return { status: 'na', summary: 'No interactive controls found.' };
      return {
        status: bad === 0 ? 'pass' : bad / Math.max(total, 1) > 0.2 || bad >= 5 ? 'fail' : 'warn',
        summary:
          bad === 0
            ? 'No custom-only widgets detected.'
            : `${custom} custom ARIA widgets and ${drag} drag-only elements.`,
        evidence: evidence.slice(0, 20),
        metrics: { customWidgets: custom, draggables: drag, interactive: total },
        pages: pagesOf(ctx),
      };
    },
  },
  {
    id: 'required-fields-marked',
    title: 'Required fields are marked programmatically',
    dimension: 'interaction',
    weight: 3,
    rationale:
      'An asterisk in the label is invisible to tree agents; required/aria-required tells them which fields must be filled before submitting.',
    references: ['WCAG 2.2 SC 3.3.2 Labels or Instructions'],
    remediation: 'Add the required attribute (or aria-required="true") to mandatory fields.',
    run(ctx) {
      let n = 0;
      let forms = 0;
      const evidence: EvidenceItem[] = [];
      for (const p of okPages(ctx))
        for (const f of p.data.forms) {
          forms++;
          if (f.requiredMarkersWithoutAttr > 0) {
            n += f.requiredMarkersWithoutAttr;
            evidence.push({
              url: p.finalUrl,
              selector: f.selector,
              observed: `${f.requiredMarkersWithoutAttr} fields marked * without required`,
              expected: 'required attribute',
            });
          }
        }
      if (forms === 0) return { status: 'na', summary: 'No forms on the scanned pages.' };
      return {
        status: n === 0 ? 'pass' : 'warn',
        summary:
          n === 0
            ? 'Required fields are marked programmatically.'
            : `${n} visually-required fields lack the required attribute.`,
        evidence,
        metrics: { forms, unmarkedRequired: n },
        pages: pagesOf(ctx),
      };
    },
  },
  {
    id: 'keyboard-operability',
    title: 'Controls are keyboard operable',
    dimension: 'interaction',
    weight: 3,
    rationale:
      'Agents press keys to submit forms and operate menus; positive tabindex and unfocusable controls break that sequence.',
    references: ['WCAG 2.2 SC 2.1.1 Keyboard', 'Lighthouse tabindex'],
    remediation:
      'Remove positive tabindex values; make custom controls focusable with tabindex="0" and handle Enter/Space.',
    run(ctx) {
      const evidence: EvidenceItem[] = [];
      let problems = 0;
      for (const p of okPages(ctx)) {
        if (p.data.positiveTabindex > 0) {
          problems += p.data.positiveTabindex;
          evidence.push({
            url: p.finalUrl,
            observed: `${p.data.positiveTabindex} elements with positive tabindex`,
            expected: 'tabindex 0 or -1 only',
          });
        }
        const v = axeViolations(p.axe, ['tabindex', 'scrollable-region-focusable']);
        problems += v.reduce((a, r) => a + r.nodes.length, 0);
        evidence.push(...axeEvidence(p, v, 5));
      }
      return {
        status: problems === 0 ? 'pass' : problems <= 2 ? 'warn' : 'fail',
        summary:
          problems === 0
            ? 'No keyboard operability problems detected.'
            : `${problems} keyboard operability problems.`,
        evidence: evidence.slice(0, 20),
        metrics: { problems },
        pages: pagesOf(ctx),
      };
    },
  },
  {
    id: 'cross-origin-iframe-controls',
    title: 'Controls are not confined to cross-origin iframes',
    dimension: 'interaction',
    weight: 3,
    rationale:
      'Several agents cannot act inside cross-origin iframes (documented for Comet; refs are frame-scoped in Playwright), so controls there are unreachable.',
    references: [
      'Research/01 §13: Comet cannot act in cross-origin iframes',
      'Playwright aria-ref frame prefix semantics',
    ],
    remediation:
      'Keep primary actions (search, checkout, contact) in the top document; if an embedded widget is required, offer an equivalent same-origin path.',
    run(ctx) {
      const evidence: EvidenceItem[] = [];
      let n = 0;
      for (const p of okPages(ctx)) {
        const cross = p.data.iframes.filter((f) => f.crossOrigin);
        if (cross.length === 0) continue;
        const inFrames = interactiveNodes(p.snapshot).filter((x) => x.frame);
        if (inFrames.length === 0) continue;
        n += inFrames.length;
        evidence.push({
          url: p.finalUrl,
          observed: `${inFrames.length} interactive controls inside ${cross.length} cross-origin iframes`,
          expected: 'primary actions in the top document',
          note: cross
            .slice(0, 3)
            .map((f) => f.src)
            .join(', '),
        });
      }
      return {
        status: n === 0 ? 'pass' : n <= 3 ? 'warn' : 'fail',
        summary:
          n === 0
            ? 'No controls confined to cross-origin iframes.'
            : `${n} controls live inside cross-origin iframes.`,
        evidence,
        metrics: { controlsInCrossOriginFrames: n },
        pages: pagesOf(ctx),
      };
    },
  },
  {
    id: 'closed-shadow-roots',
    title: 'No controls hidden in closed shadow roots',
    dimension: 'interaction',
    weight: 3,
    rationale:
      'Closed shadow roots are not traversable by DOM-based agents; some tree agents cannot act on their content.',
    references: [
      'Research/01 §14: closed shadow DOM failure mode',
      'DOM Standard: attachShadow mode',
    ],
    remediation: 'Use open shadow roots for components that contain controls.',
    run(ctx) {
      let n = 0;
      const evidence: EvidenceItem[] = [];
      for (const p of okPages(ctx)) {
        n += p.data.closedShadowRoots;
        if (p.data.closedShadowRoots > 0)
          evidence.push({
            url: p.finalUrl,
            observed: `${p.data.closedShadowRoots} closed shadow roots`,
            expected: 'open shadow roots',
            note: p.data.closedShadowHosts.slice(0, 5).join(', '),
          });
      }
      return {
        status: n === 0 ? 'pass' : 'warn',
        summary: n === 0 ? 'No closed shadow roots.' : `${n} closed shadow roots created.`,
        evidence,
        metrics: { closedShadowRoots: n },
        pages: pagesOf(ctx),
      };
    },
  },
  {
    id: 'canvas-only-ui',
    title: 'The UI is not rendered only on canvas',
    dimension: 'interaction',
    weight: 3,
    rationale:
      'Canvas/WebGL interfaces expose no accessibility tree, so tree-based agents see nothing to act on.',
    references: ['Research/01 §14: canvas/SVG without text', 'WCAG 2.2 SC 1.1.1'],
    remediation:
      'Provide DOM equivalents (fallback content, ARIA, or a parallel HTML UI) for canvas-rendered controls.',
    run(ctx) {
      const evidence: EvidenceItem[] = [];
      let worst = 0;
      for (const p of okPages(ctx)) {
        const c = p.data.canvas;
        const controls = interactiveNodes(p.snapshot).length;
        if (c.coverage > 0.5 && controls < 5) {
          worst = Math.max(worst, c.coverage);
          evidence.push({
            url: p.finalUrl,
            observed: `canvas covers ${Math.round(c.coverage * 100)}% of the viewport with ${controls} controls in the tree`,
            expected: 'DOM/ARIA equivalents',
          });
        }
      }
      return {
        status: worst === 0 ? 'pass' : 'fail',
        summary:
          worst === 0
            ? 'No canvas-only UI.'
            : 'Page is rendered mostly on canvas with few accessible controls.',
        evidence,
        metrics: { maxCanvasCoverage: worst },
        pages: pagesOf(ctx),
      };
    },
  },
  {
    id: 'target-size',
    title: 'Targets are large enough',
    dimension: 'interaction',
    weight: 1,
    rationale:
      'Vision-based agents (screenshot + coordinates) miss tiny targets; documented in computer-use guidance.',
    references: ['WCAG 2.2 SC 2.5.8 Target Size (Minimum)', 'axe-core target-size'],
    remediation: 'Make interactive targets at least 24×24 CSS px with spacing.',
    run(ctx) {
      if (!axeRan(ctx)) return { status: 'na', summary: 'axe-core did not run.' };
      let n = 0;
      const evidence: EvidenceItem[] = [];
      for (const p of okPages(ctx)) {
        const v = axeViolations(p.axe, ['target-size']);
        n += v.reduce((a, r) => a + r.nodes.length, 0);
        evidence.push(...axeEvidence(p, v, 5));
      }
      return {
        status: n === 0 ? 'pass' : n <= 3 ? 'warn' : 'fail',
        summary: n === 0 ? 'Targets meet the minimum size.' : `${n} undersized targets.`,
        evidence: evidence.slice(0, 20),
        metrics: { undersized: n },
        pages: pagesOf(ctx),
      };
    },
  },
];
