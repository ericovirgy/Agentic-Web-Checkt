import { INJECTION_PATTERNS } from '../browser/page-data.js';
import type { EvidenceItem } from '../types.js';
import { type CheckDefinition, okPages, pagesOf } from './framework.js';

const injectionRes = INJECTION_PATTERNS.map((p) => new RegExp(p, 'i'));
export function looksLikeInjection(text: string): string | null {
  for (const re of injectionRes) {
    const m = re.exec(text);
    if (m) return m[0].slice(0, 60);
  }
  return null;
}

const MUTATING_TOOL =
  /\b(delete|remove|create|add|update|send|pay|purchase|buy|order|transfer|cancel|submit|post|publish|book|register|unsubscribe|subscribe|checkout)\b/i;

export const safetyChecks: CheckDefinition[] = [
  {
    id: 'hidden-instructions',
    title: 'No hidden instructions aimed at AI agents',
    dimension: 'safety',
    weight: 10,
    rationale:
      'Indirect prompt injection through hidden page text is the top LLM application risk and has been demonstrated against browser agents (Brave/Comet). Text humans cannot see but agents receive is the attack surface.',
    references: [
      'OWASP Top 10 for LLM Applications 2025: LLM01 Prompt Injection',
      'Brave Research on Perplexity Comet (2025-08)',
      'WebMCP untrustedContentHint',
    ],
    remediation:
      'Remove hidden text that addresses AI systems; keep hidden content limited to layout helpers; do not place instructions in HTML comments or aria-hidden text.',
    run(ctx) {
      const evidence: EvidenceItem[] = [];
      let hits = 0;
      let hiddenBlocks = 0;
      for (const p of okPages(ctx)) {
        hiddenBlocks += p.data.hiddenBlocks.length;
        for (const b of p.data.hiddenBlocks) {
          const m = looksLikeInjection(b.text);
          if (m) {
            hits++;
            if (evidence.length < 20)
              evidence.push({
                url: p.finalUrl,
                selector: b.selector,
                observed: `hidden (${b.reason}): "${b.text.slice(0, 120)}"`,
                expected: 'no instructions in hidden text',
                note: `matched: ${m}`,
              });
          }
        }
        for (const c of p.data.htmlComments) {
          const m = looksLikeInjection(c);
          if (m) {
            hits++;
            if (evidence.length < 20)
              evidence.push({
                url: p.finalUrl,
                observed: `HTML comment: "${c.slice(0, 120)}"`,
                expected: 'no instructions in comments',
                note: `matched: ${m}`,
              });
          }
        }
      }
      return {
        status: hits > 0 ? 'fail' : 'pass',
        summary:
          hits > 0
            ? `${hits} hidden text blocks contain instruction-like text aimed at AI systems.`
            : `No instruction-like hidden text (${hiddenBlocks} hidden blocks inspected).`,
        evidence,
        metrics: { injectionHits: hits, hiddenBlocks },
        pages: pagesOf(ctx),
      };
    },
  },
  {
    id: 'consequential-actions-guarded',
    title: 'Consequential actions require confirmation',
    dimension: 'safety',
    weight: 7,
    rationale:
      'Vendors converge on a taxonomy of actions that need human confirmation (purchase, pay, transfer, send, delete, cancel, grant). A site that executes them on a single click gives an agent no safe stopping point.',
    references: [
      'OWASP LLM01 mitigation: human approval for high-risk operations',
      'OpenAI Operator / Anthropic Claude for Chrome confirmation policies',
      'WebMCP consequentialHint',
    ],
    remediation:
      'Put consequential actions behind a confirmation dialog (aria-haspopup="dialog" + <dialog>) or a review step; never auto-submit them.',
    run(ctx) {
      const evidence: EvidenceItem[] = [];
      let total = 0;
      let unguarded = 0;
      for (const p of okPages(ctx)) {
        for (const c of p.data.consequentialControls) {
          total++;
          if (!c.guarded) {
            unguarded++;
            if (evidence.length < 20)
              evidence.push({
                url: p.finalUrl,
                selector: c.selector,
                element: `${c.kind} "${c.name}"${c.href ? ` → ${c.href}` : ''}`,
                observed: 'immediate action without confirmation signal',
                expected: 'confirmation dialog or review step',
              });
          } else if (evidence.length < 20)
            evidence.push({
              url: p.finalUrl,
              selector: c.selector,
              element: `${c.kind} "${c.name}"`,
              observed: `guarded: ${c.guardReason}`,
            });
        }
      }
      if (total === 0)
        return { status: 'na', summary: 'No consequential actions found on the scanned pages.' };
      return {
        status: unguarded === 0 ? 'pass' : 'warn',
        summary:
          unguarded === 0
            ? `${total} consequential actions, all guarded.`
            : `${unguarded} of ${total} consequential actions execute without a visible confirmation step.`,
        evidence,
        metrics: { consequential: total, unguarded },
        pages: pagesOf(ctx),
      };
    },
  },
  {
    id: 'forms-safe-transport',
    title: 'Forms submit safely',
    dimension: 'safety',
    weight: 7,
    rationale:
      'An agent filling a form that posts over plain HTTP or to a third-party origin leaks data it was trusted with.',
    references: ['OWASP ASVS V3/V9 (transport)', 'HTML form action/method semantics'],
    remediation:
      'Serve pages over HTTPS, post forms to the same origin over HTTPS, and never send passwords with method="get".',
    run(ctx) {
      const evidence: EvidenceItem[] = [];
      let problems = 0;
      let forms = 0;
      for (const p of okPages(ctx)) {
        const origin = new URL(p.finalUrl).origin;
        const insecurePage =
          new URL(p.finalUrl).protocol === 'http:' &&
          !/^(localhost|127\.0\.0\.1)$/.test(new URL(p.finalUrl).hostname);
        for (const f of p.data.forms) {
          forms++;
          let action: URL | null = null;
          try {
            action = new URL(f.action || p.finalUrl, p.finalUrl);
          } catch {}
          const issues: string[] = [];
          if (
            action &&
            action.protocol === 'http:' &&
            !/^(localhost|127\.0\.0\.1)$/.test(action.hostname)
          )
            issues.push('posts over http');
          if (action && action.origin !== origin && /^https?:/.test(action.protocol))
            issues.push(`posts to another origin (${action.origin})`);
          if (f.hasPassword && f.method === 'get') issues.push('password sent with method=get');
          if (f.hasPassword && insecurePage) issues.push('password field on an http page');
          if (issues.length) {
            problems++;
            evidence.push({
              url: p.finalUrl,
              selector: f.selector,
              observed: issues.join('; '),
              expected: 'same-origin HTTPS POST',
            });
          }
        }
        if (p.data.passwordFieldsOutsideForms > 0) {
          problems++;
          evidence.push({
            url: p.finalUrl,
            observed: `${p.data.passwordFieldsOutsideForms} password fields outside any form`,
            expected: 'credential inputs inside a labelled form',
          });
        }
      }
      if (forms === 0 && problems === 0)
        return { status: 'na', summary: 'No forms on the scanned pages.' };
      return {
        status: problems === 0 ? 'pass' : 'fail',
        summary:
          problems === 0
            ? `${forms} forms submit to the same origin over HTTPS.`
            : `${problems} forms or credential fields submit unsafely.`,
        evidence,
        metrics: { forms, problems },
        pages: pagesOf(ctx),
      };
    },
  },
  {
    id: 'webmcp-tool-annotations',
    title: 'WebMCP tools declare safety annotations',
    dimension: 'safety',
    weight: 3,
    rationale:
      'The WebMCP draft defines readOnlyHint, consequentialHint and untrustedContentHint so agents can ask for confirmation; a mutating tool without consequentialHint, or a declarative form with toolautosubmit on a consequential action, removes that safeguard.',
    references: [
      'WebMCP spec: Security and Privacy considerations, ToolAnnotations',
      'WebMCP declarative API toolautosubmit',
    ],
    remediation:
      'Add annotations: { readOnlyHint: true } for read tools and { consequentialHint: true } for mutating tools; do not use toolautosubmit on consequential forms.',
    run(ctx) {
      const evidence: EvidenceItem[] = [];
      let tools = 0;
      let problems = 0;
      for (const p of okPages(ctx)) {
        for (const t of p.data.webmcp.tools) {
          tools++;
          const ann = t.annotations ?? {};
          const mutating = MUTATING_TOOL.test(t.name) || MUTATING_TOOL.test(t.description);
          if (mutating && !ann.consequentialHint && !ann.readOnlyHint) {
            problems++;
            evidence.push({
              url: p.finalUrl,
              element: `tool ${t.name}`,
              observed: 'mutating tool without consequentialHint',
              expected: 'annotations.consequentialHint = true',
            });
          }
        }
        for (const f of p.data.forms) {
          if (!f.toolname) continue;
          tools++;
          const mutating =
            MUTATING_TOOL.test(f.toolname) ||
            MUTATING_TOOL.test(f.tooldescription ?? '') ||
            f.method === 'post';
          if (f.toolautosubmit && mutating) {
            problems++;
            evidence.push({
              url: p.finalUrl,
              selector: f.selector,
              element: `form toolname=${f.toolname}`,
              observed: 'toolautosubmit on a consequential form',
              expected: 'no toolautosubmit; let the agent confirm',
            });
          }
        }
      }
      if (tools === 0) return { status: 'na', summary: 'No WebMCP tools.' };
      return {
        status: problems === 0 ? 'pass' : 'warn',
        summary:
          problems === 0
            ? `${tools} WebMCP tools carry appropriate annotations.`
            : `${problems} of ${tools} WebMCP tools lack safety annotations.`,
        evidence,
        metrics: { tools, problems },
        pages: pagesOf(ctx),
      };
    },
  },
  {
    id: 'auth-boundary-signalled',
    title: 'Authentication boundaries are clearly signalled',
    dimension: 'safety',
    weight: 3,
    rationale:
      'Agents must recognise a login wall to stop and ask the user; an unlabelled password field or a credential input outside a form hides that boundary.',
    references: [
      'GUI-Robust anomaly taxonomy: login page',
      'WCAG 2.2 SC 3.3.8',
      'HTML autocomplete tokens username/current-password',
    ],
    remediation:
      'Place credentials in a <form> with labelled fields, autocomplete="username"/"current-password", a named submit button and a heading such as "Sign in".',
    run(ctx) {
      const evidence: EvidenceItem[] = [];
      let loginForms = 0;
      let problems = 0;
      for (const p of okPages(ctx)) {
        for (const f of p.data.forms) {
          if (!f.hasPassword) continue;
          loginForms++;
          const named = f.submitName.length > 0;
          const headed =
            p.data.headings.some((h) =>
              /sign in|log in|login|sign up|register|create account|iniciar sess|entrar|registar/i.test(
                h.text,
              ),
            ) || /sign in|log in|login|entrar|iniciar sess/i.test(p.data.title);
          if (!named || !headed) {
            problems++;
            evidence.push({
              url: p.finalUrl,
              selector: f.selector,
              observed:
                `${named ? '' : 'submit button unnamed; '}${headed ? '' : 'no sign-in heading/title'}`.trim(),
              expected: 'labelled login form with a "Sign in" heading and named submit',
            });
          } else
            evidence.push({
              url: p.finalUrl,
              selector: f.selector,
              observed: `login form labelled ("${f.submitName}")`,
            });
        }
        if (p.data.passwordFieldsOutsideForms > 0) {
          problems++;
          evidence.push({
            url: p.finalUrl,
            observed: `${p.data.passwordFieldsOutsideForms} password fields outside a form`,
            expected: 'credentials inside a form',
          });
        }
      }
      if (loginForms === 0 && problems === 0)
        return { status: 'na', summary: 'No authentication forms on the scanned pages.' };
      return {
        status: problems === 0 ? 'pass' : 'warn',
        summary:
          problems === 0
            ? `${loginForms} login forms are clearly signalled.`
            : `${problems} authentication boundary problems.`,
        evidence,
        metrics: { loginForms, problems },
        pages: pagesOf(ctx),
      };
    },
  },
  {
    id: 'exposed-secrets',
    title: 'No secret-looking tokens in page source',
    dimension: 'safety',
    weight: 3,
    rationale:
      'An agent that reads the page source can be led to use or leak embedded credentials; patterns for common providers are detected and redacted.',
    references: [
      'OWASP LLM02:2025 Sensitive Information Disclosure',
      'Common secret patterns (AWS, GitHub, Stripe, OpenAI, Anthropic, Slack, private keys)',
    ],
    remediation:
      'Remove secrets from HTML and inline scripts; use server-side proxies or short-lived scoped tokens.',
    run(ctx) {
      const evidence: EvidenceItem[] = [];
      let hits = 0;
      for (const p of okPages(ctx)) {
        for (const s of p.data.secretHits) {
          hits++;
          if (evidence.length < 20)
            evidence.push({
              url: p.finalUrl,
              observed: `${s.pattern} in ${s.where}: ${s.redacted}`,
              expected: 'no secrets in client-side source',
            });
        }
      }
      return {
        status: hits === 0 ? 'pass' : 'fail',
        summary:
          hits === 0
            ? 'No secret-looking tokens found.'
            : `${hits} secret-looking tokens found (redacted).`,
        evidence,
        metrics: { hits },
        pages: pagesOf(ctx),
      };
    },
  },
  {
    id: 'download-and-popup-links',
    title: 'Downloads and new windows are announced',
    dimension: 'safety',
    weight: 1,
    rationale:
      'Unexpected downloads and new windows break the single-tab model most browser agents run with; naming them lets the agent decide.',
    references: [
      'agent-browser / Playwright MCP tab model',
      'WCAG 2.2 G201 (advance warning for new windows)',
    ],
    remediation:
      'Say "(PDF)", "(download)" or "(opens in new tab)" in the link text or aria-label.',
    run(ctx) {
      const evidence: EvidenceItem[] = [];
      let n = 0;
      let total = 0;
      for (const p of okPages(ctx)) {
        for (const l of p.data.links) {
          const name = (l.ariaLabel || l.text).toLowerCase();
          const isDownload =
            l.download ||
            /\.(zip|exe|dmg|pkg|msi|pdf|docx?|xlsx?|csv|apk|tar|gz|7z)$/i.test(
              l.href.split('?')[0] ?? '',
            );
          const popup = l.target === '_blank';
          if (!isDownload && !popup) continue;
          total++;
          const announced =
            /download|pdf|zip|csv|file|new (tab|window)|opens|externo|descarregar|transferir/.test(
              name,
            );
          if (!announced) {
            n++;
            if (evidence.length < 20)
              evidence.push({
                url: p.finalUrl,
                selector: l.selector,
                element: `link "${l.text || l.ariaLabel}" → ${l.href.slice(0, 80)}`,
                observed: isDownload
                  ? 'download not announced in name'
                  : 'opens new window without saying so',
                expected: 'name mentions download / new tab',
              });
          }
        }
      }
      if (total === 0) return { status: 'na', summary: 'No download or new-window links.' };
      return {
        status: n === 0 ? 'pass' : 'warn',
        summary:
          n === 0
            ? `${total} download/new-window links are announced.`
            : `${n} of ${total} download/new-window links are not announced.`,
        evidence,
        metrics: { total, unannounced: n },
        pages: pagesOf(ctx),
      };
    },
  },
];
