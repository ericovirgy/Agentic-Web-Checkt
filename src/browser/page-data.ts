/**
 * DOM facts collected in one `page.evaluate` after the page settled.
 * Everything here is deterministic and bounded in size.
 */

export interface HiddenTextBlock {
  reason: string;
  selector: string;
  text: string;
}

export interface FormInfo {
  selector: string;
  action: string;
  method: string;
  fieldCount: number;
  unnamedFields: number;
  hasPassword: boolean;
  submitName: string;
  toolname?: string;
  tooldescription?: string;
  toolautosubmit?: boolean;
  textSample: string;
  requiredMarkersWithoutAttr: number;
  /** Fields whose aria-label does not contain the visible <label> text (WCAG 2.5.3 for inputs). */
  labelMismatches: { selector: string; visible: string; accessible: string }[];
}

export interface LinkInfo {
  selector: string;
  href: string;
  text: string;
  ariaLabel: string;
  inNav: boolean;
  visible: boolean;
  target: string;
  download: boolean;
  external: boolean;
}

export interface OverlayInfo {
  selector: string;
  coverage: number;
  coversCenter: number;
  zIndex: string;
  dismissControls: string[];
  textSample: string;
}

export interface ClickableInfo {
  selector: string;
  tag: string;
  text: string;
  reason: string;
}

export interface PageData {
  title: string;
  lang: string;
  textLength: number;
  htmlLength: number;
  hiddenBlocks: HiddenTextBlock[];
  htmlComments: string[];
  forms: FormInfo[];
  links: LinkInfo[];
  overlays: OverlayInfo[];
  nonSemanticClickables: ClickableInfo[];
  landmarks: { main: number; nav: number; search: number; banner: number; contentinfo: number };
  headings: { level: number; text: string }[];
  jsonLd: { types: string[]; valid: boolean; raw: string }[];
  canvas: { coverage: number; count: number };
  iframes: { src: string; crossOrigin: boolean; selector: string }[];
  passwordFieldsOutsideForms: number;
  /** Form controls that are not inside any <form>. */
  looseFields: { count: number; unnamed: number };
  inputTypeSearch: number;
  customWidgets: { role: string; selector: string; reason: string }[];
  draggables: number;
  contentEditable: number;
  positiveTabindex: number;
  consequentialControls: {
    selector: string;
    name: string;
    kind: 'button' | 'link' | 'submit';
    guarded: boolean;
    guardReason: string;
    href?: string;
  }[];
  secretHits: { pattern: string; redacted: string; where: string }[];
  webmcp: {
    api: string | null;
    native: boolean;
    tools: {
      name: string;
      description: string;
      inputSchema: unknown;
      annotations: Record<string, unknown> | null;
      hasExecute: boolean;
      via: string;
    }[];
    declarativeForms: number;
    polyfillFingerprint: boolean;
  };
  closedShadowRoots: number;
  closedShadowHosts: string[];
  clickListenerCount: number;
  mutations: number;
  mutationsAfterSettle: number;
  cls: number;
  runtimeErrors: string[];
  challengeMarkers: string[];
  viewport: { width: number; height: number };
}

/** Vocabulary used both in the browser (consequential controls) and in checks. Keep in sync with docs/SCORING.md. */
export const CONSEQUENTIAL_WORDS = [
  'buy',
  'buy now',
  'purchase',
  'pay',
  'checkout',
  'check out',
  'place order',
  'order now',
  'subscribe',
  'unsubscribe',
  'cancel subscription',
  'delete',
  'remove account',
  'delete account',
  'deactivate',
  'transfer',
  'send money',
  'wire',
  'withdraw',
  'send',
  'publish',
  'post',
  'share',
  'grant',
  'authorize',
  'authorise',
  'accept terms',
  'confirm payment',
  'book now',
  'reserve',
  'cancel order',
  'comprar',
  'pagar',
  'eliminar',
  'apagar',
  'enviar',
  'transferir',
];

export const CONSEQUENTIAL_NOISE = [
  'cancel',
  'close',
  'send feedback',
  'send message',
  'post comment',
];

export const DISMISS_WORDS = [
  'accept',
  'accept all',
  'agree',
  'i agree',
  'ok',
  'okay',
  'got it',
  'close',
  'dismiss',
  'reject',
  'reject all',
  'decline',
  'no thanks',
  'continue',
  'allow',
  'allow all',
  'aceitar',
  'fechar',
  'rejeitar',
  'concordo',
];

export const SECRET_PATTERNS: { name: string; regex: string }[] = [
  { name: 'aws-access-key', regex: '\\bAKIA[0-9A-Z]{16}\\b' },
  { name: 'github-token', regex: '\\bgh[pousr]_[A-Za-z0-9]{36,}\\b' },
  { name: 'stripe-live-secret', regex: '\\bsk_live_[0-9a-zA-Z]{20,}\\b' },
  { name: 'openai-key', regex: '\\bsk-[A-Za-z0-9_-]{32,}\\b' },
  { name: 'anthropic-key', regex: '\\bsk-ant-[A-Za-z0-9_-]{32,}\\b' },
  { name: 'slack-token', regex: '\\bxox[baprs]-[0-9A-Za-z-]{10,}\\b' },
  { name: 'google-api-key', regex: '\\bAIza[0-9A-Za-z_-]{35}\\b' },
  { name: 'private-key-block', regex: '-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----' },
  { name: 'jwt', regex: '\\beyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\b' },
];

export const CHALLENGE_MARKERS = [
  'cf-challenge',
  'cf_chl',
  'challenge-platform',
  'turnstile',
  'g-recaptcha',
  'recaptcha',
  'h-captcha',
  'hcaptcha',
  'verify you are human',
  'verifying you are human',
  'checking your browser',
  'enable javascript and cookies to continue',
  'just a moment',
  'access denied',
  'are you a robot',
  'bot detection',
  'px-captcha',
  'datadome',
  'perimeterx',
  'akamai bot',
];

export const INJECTION_PATTERNS: string[] = [
  'ignore (all |any |the )?(previous|prior|above|earlier) (instructions|prompts|rules|messages)',
  'disregard (all |any |the )?(previous|prior|above) ',
  'you are (now |an? )?(ai|assistant|chatgpt|claude|gpt|llm|language model)',
  '\\b(ai|llm|chatbot|assistant|agent)s?\\b[^.]{0,60}\\b(must|should|need to|have to|are required to)\\b',
  'system prompt',
  'new instructions?:',
  'important instructions? for (ai|assistants?|agents?|llms?)',
  "(do not|don't|never) (tell|inform|reveal|mention)[^.]{0,40}(user|human)",
  'when summari[sz]ing',
  '\\bprompt injection\\b',
  'exfiltrat',
  "send (the )?(user'?s? )?(password|credentials|token|api key)",
  '(email|send|post|submit) .{0,40}(password|credentials|secret|api key|token) to',
  'visit (https?://)?[a-z0-9.-]+\\.(example|xyz|top|tk|ru)\\b',
  'instructions? (for|to) (the )?(ai|model|assistant|agent)',
  'as an ai',
  'ignore the (user|human)',
  'assistant[,:]',
];

export const PAGE_DATA_SCRIPT = `(args) => {
  const { consequentialWords, consequentialNoise, dismissWords, secretPatterns, challengeMarkers, injectionPatterns } = args;
  const MAX = 40;
  const vw = window.innerWidth, vh = window.innerHeight;
  const norm = (s) => (s || '').replace(/\\s+/g, ' ').trim();
  const lower = (s) => norm(s).toLowerCase();

  function cssPath(el) {
    if (!(el instanceof Element)) return '';
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && parts.length < 6) {
      let sel = cur.tagName.toLowerCase();
      if (cur.id && /^[A-Za-z][\\w-]*$/.test(cur.id)) { parts.unshift(sel + '#' + cur.id); break; }
      const parent = cur.parentElement;
      if (parent) {
        const sibs = Array.from(parent.children).filter((c) => c.tagName === cur.tagName);
        if (sibs.length > 1) sel += ':nth-of-type(' + (sibs.indexOf(cur) + 1) + ')';
      }
      parts.unshift(sel);
      cur = parent;
    }
    return parts.join(' > ');
  }

  function isVisuallyHidden(el) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none') return 'display:none';
    if (cs.visibility === 'hidden' || cs.visibility === 'collapse') return 'visibility:' + cs.visibility;
    if (parseFloat(cs.opacity) === 0) return 'opacity:0';
    if (parseFloat(cs.fontSize) === 0) return 'font-size:0';
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0 && el.textContent && el.textContent.trim().length > 0 && cs.position !== 'static') return 'zero-size';
    if (r.right < 0 || r.bottom < 0 || r.left > Math.max(vw, document.documentElement.scrollWidth) + 50) return 'off-screen';
    if (/^rect\\(0(px)?,? 0(px)?,? 0(px)?,? 0(px)?\\)$/.test(cs.clip || '') || (cs.clipPath && cs.clipPath.startsWith('inset(100%'))) return 'clip';
    if (cs.color && cs.backgroundColor && cs.color === cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') return 'color-matches-background';
    if (cs.color === 'rgba(0, 0, 0, 0)' || cs.color === 'transparent') return 'transparent-text';
    // white text on white (walk up to find bg)
    if (cs.color === 'rgb(255, 255, 255)') {
      let p = el; let bg = 'rgba(0, 0, 0, 0)';
      while (p && (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent')) { bg = getComputedStyle(p).backgroundColor; p = p.parentElement; }
      if (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') bg = 'rgb(255, 255, 255)';
      if (bg === 'rgb(255, 255, 255)') return 'white-on-white';
    }
    return null;
  }

  const injectionRe = injectionPatterns.map((p) => new RegExp(p, 'i'));
  const hasZeroWidth = (s) => /[\\u200B-\\u200D\\u2060\\uFEFF]/.test(s);
  const stripZeroWidth = (s) => s.replace(/[\\u200B-\\u200D\\u2060\\uFEFF]/g, '');

  // Hidden text blocks: leaf-ish elements with text, hidden by style, or aria-hidden
  const hiddenBlocks = [];
  const seenHidden = new Set();
  const allEls = Array.from(document.querySelectorAll('body *'));
  for (const el of allEls) {
    if (hiddenBlocks.length >= 200) break;
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'PATH'].includes(el.tagName)) continue;
    const own = Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ');
    const text = norm(own);
    if (text.length < 12) continue;
    let reason = isVisuallyHidden(el);
    if (!reason) {
      let p = el; let ah = false;
      while (p && p !== document.body) { if (p.getAttribute && p.getAttribute('aria-hidden') === 'true') { ah = true; break; } p = p.parentElement; }
      if (ah) reason = 'aria-hidden';
    }
    if (!reason) {
      let p = el.parentElement;
      while (p && p !== document.body) { const r = isVisuallyHidden(p); if (r) { reason = r + ' (ancestor)'; break; } p = p.parentElement; }
    }
    if (!reason && hasZeroWidth(own) && injectionRe.some((re) => re.test(stripZeroWidth(own)))) reason = 'zero-width-characters';
    if (!reason) continue;
    const key = reason + '|' + text.slice(0, 80);
    if (seenHidden.has(key)) continue;
    seenHidden.add(key);
    hiddenBlocks.push({ reason, selector: cssPath(el), text: stripZeroWidth(text).slice(0, 300) });
  }
  const htmlComments = [];
  try {
    const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_COMMENT);
    let c; while ((c = walker.nextNode()) && htmlComments.length < 100) { const t = norm(c.textContent); if (t.length >= 12) htmlComments.push(t.slice(0, 300)); }
  } catch {}

  // Forms
  const forms = Array.from(document.querySelectorAll('form')).slice(0, 50).map((f) => {
    const fields = Array.from(f.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]),select,textarea'));
    const submit = f.querySelector('button[type=submit],input[type=submit],button:not([type])');
    let requiredMarkersWithoutAttr = 0;
    const labelMismatches = [];
    for (const field of fields) {
      const id = field.id; const label = (id ? f.querySelector('label[for="' + CSS.escape(id) + '"]') : null) || field.closest('label');
      const lt = label ? norm(label.textContent) : '';
      if (/\\*/.test(lt) && !field.required && field.getAttribute('aria-required') !== 'true') requiredMarkersWithoutAttr++;
      const al = norm(field.getAttribute('aria-label') || '');
      const visible = lt.replace(/[*:]/g, '').trim();
      if (al && visible && !lower(al).includes(lower(visible)) && labelMismatches.length < 10) labelMismatches.push({ selector: cssPath(field), visible: visible.slice(0, 60), accessible: al.slice(0, 60) });
    }
    return {
      selector: cssPath(f),
      action: f.getAttribute('action') || '',
      method: (f.getAttribute('method') || 'get').toLowerCase(),
      fieldCount: fields.length,
      unnamedFields: fields.filter((x) => !x.getAttribute('name')).length,
      hasPassword: !!f.querySelector('input[type=password]'),
      submitName: submit ? norm(submit.textContent || submit.value || submit.getAttribute('aria-label') || '') : '',
      toolname: f.getAttribute('toolname') || undefined,
      tooldescription: f.getAttribute('tooldescription') || undefined,
      toolautosubmit: f.hasAttribute('toolautosubmit') || undefined,
      textSample: norm(f.textContent).slice(0, 200),
      requiredMarkersWithoutAttr,
      labelMismatches,
    };
  });

  // Links
  const origin = location.origin;
  const links = Array.from(document.querySelectorAll('a[href]')).slice(0, 400).map((a) => {
    const r = a.getBoundingClientRect(); const cs = getComputedStyle(a);
    const visible = r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
    let external = false; let href = a.getAttribute('href') || '';
    try { const u = new URL(href, location.href); external = u.origin !== origin && /^https?:/.test(u.protocol); } catch {}
    return {
      selector: cssPath(a), href, text: norm(a.textContent).slice(0, 80), ariaLabel: norm(a.getAttribute('aria-label') || ''),
      inNav: !!a.closest('nav,[role=navigation]'), visible, target: a.getAttribute('target') || '', download: a.hasAttribute('download'), external,
    };
  });

  // Overlays: fixed/sticky elements covering the viewport
  const overlays = [];
  for (const el of allEls) {
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const ix = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
    const iy = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
    const coverage = (ix * iy) / (vw * vh);
    const coversCenter = r.left <= vw / 2 && r.right >= vw / 2 && r.top <= vh / 2 && r.bottom >= vh / 2 ? 1 : 0;
    if (coverage < 0.25 && !coversCenter) continue;
    if (el.closest('header,nav') && coverage < 0.3 && !coversCenter) continue;
    const controls = Array.from(el.querySelectorAll('button,a[href],[role=button],input[type=button],input[type=submit]'));
    const dismissControls = controls.map((c) => lower(c.getAttribute('aria-label') || c.textContent || c.value || '')).filter((n) => n && dismissWords.some((w) => n === w || n.startsWith(w + ' ') || n.includes(' ' + w)));
    overlays.push({ selector: cssPath(el), coverage: Math.round(coverage * 100) / 100, coversCenter, zIndex: cs.zIndex, dismissControls: dismissControls.slice(0, 5), textSample: norm(el.textContent).slice(0, 160) });
    if (overlays.length >= 10) break;
  }

  // Non-semantic clickables: elements with onclick/listeners/cursor pointer that are not natively interactive and have no role
  const awc = window.__awc || { clickListeners: { has: () => false } };
  const nativeInteractive = 'a[href],button,input,select,textarea,summary,details,label,option,video[controls],audio[controls]';
  const nonSemanticClickables = [];
  for (const el of allEls) {
    if (nonSemanticClickables.length >= 100) break;
    if (el.matches(nativeInteractive) || el.closest(nativeInteractive)) continue;
    if (el.getAttribute('role')) continue;
    if (el.closest('[role]') && el.closest('[role]') !== document.body && /button|link|menuitem|tab|option|checkbox|radio|switch/.test(el.closest('[role]').getAttribute('role'))) continue;
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || cs.display === 'none') continue;
    let reason = null;
    if (el.hasAttribute('onclick')) reason = 'onclick attribute';
    else if (awc.clickListeners.has(el)) reason = 'click listener';
    else if (cs.cursor === 'pointer' && !el.querySelector(nativeInteractive) && norm(el.textContent).length > 0 && norm(el.textContent).length < 60 && el.children.length <= 2) reason = 'cursor:pointer';
    if (!reason) continue;
    if (el.tagName === 'BODY' || el.tagName === 'HTML') continue;
    nonSemanticClickables.push({ selector: cssPath(el), tag: el.tagName.toLowerCase(), text: norm(el.textContent).slice(0, 60), reason });
  }

  const landmarks = {
    main: document.querySelectorAll('main,[role=main]').length,
    nav: document.querySelectorAll('nav,[role=navigation]').length,
    search: document.querySelectorAll('[role=search],search').length,
    banner: document.querySelectorAll('header:not(article header):not(section header):not(main header),[role=banner]').length,
    contentinfo: document.querySelectorAll('footer:not(article footer):not(section footer):not(main footer),[role=contentinfo]').length,
  };
  const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role=heading]')).slice(0, 100).map((h) => ({ level: parseInt(h.getAttribute('aria-level') || h.tagName.replace(/\\D/g, '') || '2', 10), text: norm(h.textContent).slice(0, 80) }));

  const jsonLd = Array.from(document.querySelectorAll('script[type="application/ld+json"]')).slice(0, 20).map((s) => {
    const raw = (s.textContent || '').slice(0, 20000);
    try {
      const parsed = JSON.parse(raw);
      const types = [];
      const walk = (o) => { if (!o || typeof o !== 'object') return; if (Array.isArray(o)) return o.forEach(walk); if (o['@type']) types.push(...[].concat(o['@type'])); for (const k of Object.keys(o)) if (k !== '@context') walk(o[k]); };
      walk(parsed);
      return { types: Array.from(new Set(types)).slice(0, 20), valid: true, raw: raw.slice(0, 500) };
    } catch { return { types: [], valid: false, raw: raw.slice(0, 500) }; }
  });

  let canvasCoverage = 0; const canvases = Array.from(document.querySelectorAll('canvas'));
  for (const c of canvases) { const r = c.getBoundingClientRect(); const ix = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0)); const iy = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0)); canvasCoverage += (ix * iy) / (vw * vh); }

  const iframes = Array.from(document.querySelectorAll('iframe')).slice(0, 30).map((f) => { const src = f.getAttribute('src') || (f.hasAttribute('srcdoc') ? 'about:srcdoc' : ''); let cross = false; try { if (src && !src.startsWith('about:')) cross = new URL(src, location.href).origin !== origin; } catch {} return { src: src.slice(0, 200), crossOrigin: cross, selector: cssPath(f) }; });

  const passwordFieldsOutsideForms = Array.from(document.querySelectorAll('input[type=password]')).filter((i) => !i.form).length;
  const looseFieldEls = Array.from(document.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]),select,textarea')).filter((f) => !f.form);
  const looseFields = { count: looseFieldEls.length, unnamed: looseFieldEls.filter((f) => !f.getAttribute('name')).length };
  const inputTypeSearch = document.querySelectorAll('input[type=search]').length;

  const customWidgets = [];
  for (const el of Array.from(document.querySelectorAll('[role=slider],[role=combobox],[role=listbox],[role=textbox],[role=spinbutton],[role=menu],[role=tree],[role=grid],[contenteditable=true],[contenteditable=""]')).slice(0, 60)) {
    const role = el.getAttribute('role') || 'contenteditable';
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) continue;
    let reason = 'ARIA widget without native control';
    if (role === 'slider' && !el.hasAttribute('aria-valuenow')) reason = 'slider without aria-valuenow';
    if (role === 'combobox' && !el.querySelector('input') && !el.hasAttribute('aria-controls') && !el.hasAttribute('aria-expanded')) reason = 'combobox without input/aria-expanded';
    customWidgets.push({ role, selector: cssPath(el), reason });
  }
  const draggables = document.querySelectorAll('[draggable=true]').length;
  const contentEditable = document.querySelectorAll('[contenteditable=true],[contenteditable=""]').length;
  const positiveTabindex = Array.from(document.querySelectorAll('[tabindex]')).filter((e) => parseInt(e.getAttribute('tabindex') || '0', 10) > 0).length;

  // Consequential controls
  const consequentialControls = [];
  const ctrlEls = Array.from(document.querySelectorAll('button,input[type=submit],input[type=button],a[href],[role=button]')).slice(0, 500);
  for (const el of ctrlEls) {
    const name = lower(el.getAttribute('aria-label') || el.textContent || el.value || el.getAttribute('title') || '');
    if (!name || name.length > 60) continue;
    if (consequentialNoise.some((n) => name === n)) continue;
    const hit = consequentialWords.find((w) => name === w || name.startsWith(w + ' ') || name.endsWith(' ' + w) || name.includes(' ' + w + ' '));
    if (!hit) continue;
    const isLink = el.tagName === 'A';
    const form = el.closest('form');
    const kind = isLink ? 'link' : form ? 'submit' : 'button';
    let guarded = false; let guardReason = 'none';
    const onclick = el.getAttribute('onclick') || '';
    const formText = form ? lower(form.textContent) : '';
    if (el.getAttribute('aria-haspopup') === 'dialog' || el.getAttribute('aria-haspopup') === 'true') { guarded = true; guardReason = 'aria-haspopup'; }
    else if (/confirm\\(/.test(onclick)) { guarded = true; guardReason = 'confirm() in handler'; }
    else if (form && /\\b(confirm|are you sure|review your order|i understand|i agree)\\b/.test(formText)) { guarded = true; guardReason = 'confirmation text in form'; }
    else if (isLink) { let href = el.getAttribute('href') || ''; try { const u = new URL(href, location.href); if (!/[?&](confirm|delete|action|do)=/.test(u.search) && u.pathname.split('/').length <= 3 && !/\\b(delete|remove|cancel|pay|transfer)\\b/.test(u.pathname.split('/').pop() || '')) { guarded = true; guardReason = 'navigates to a page (no immediate effect)'; } } catch {} }
    else if (el.closest('dialog,[role=dialog],[role=alertdialog]')) { guarded = true; guardReason = 'inside a dialog'; }
    consequentialControls.push({ selector: cssPath(el), name: name.slice(0, 60), kind, guarded, guardReason, href: isLink ? (el.getAttribute('href') || '').slice(0, 120) : undefined });
    if (consequentialControls.length >= 40) break;
  }

  // Secrets in inline scripts and HTML
  const secretHits = [];
  const sources = [['inline-script', Array.from(document.querySelectorAll('script:not([src])')).map((s) => s.textContent || '').join('\\n').slice(0, 500000)], ['html', document.documentElement.outerHTML.slice(0, 500000)]];
  for (const [where, src] of sources) {
    for (const p of secretPatterns) {
      const re = new RegExp(p.regex, 'g'); let m; let n = 0;
      while ((m = re.exec(src)) && n < 3) { const v = m[0]; secretHits.push({ pattern: p.name, redacted: v.slice(0, 6) + '…' + v.slice(-3) + ' (' + v.length + ' chars)', where }); n++; }
    }
  }

  const bodyLower = lower(document.body ? document.body.innerText : '').slice(0, 20000) + ' ' + lower(document.title) + ' ' + Array.from(document.querySelectorAll('[id],[class]')).slice(0, 2000).map((e) => (e.id + ' ' + e.className).toLowerCase()).join(' ');
  const challengeFound = challengeMarkers.filter((m) => bodyLower.includes(m));

  const st = window.__awc || {};
  const scripts = Array.from(document.scripts).map((s) => (s.src || '') + ' ' + (s.textContent || '').slice(0, 2000)).join(' ');
  const webmcp = {
    api: st.webmcp ? st.webmcp.api : null,
    native: st.webmcp ? !!st.webmcp.native : false,
    tools: st.webmcp ? st.webmcp.tools.slice(0, 50) : [],
    declarativeForms: document.querySelectorAll('form[toolname]').length,
    polyfillFingerprint: /@mcp-b\\/|webmcp-polyfill|mcp-b\\.ai/i.test(scripts),
  };

  return {
    title: document.title || '',
    lang: document.documentElement.getAttribute('lang') || '',
    textLength: norm(document.body ? document.body.innerText : '').length,
    htmlLength: document.documentElement.outerHTML.length,
    hiddenBlocks, htmlComments, forms, links, overlays, nonSemanticClickables, landmarks, headings, jsonLd,
    canvas: { coverage: Math.round(canvasCoverage * 100) / 100, count: canvases.length },
    iframes, passwordFieldsOutsideForms, looseFields, inputTypeSearch, customWidgets, draggables, contentEditable, positiveTabindex,
    consequentialControls, secretHits, webmcp,
    closedShadowRoots: st.closedShadowRoots || 0, closedShadowHosts: st.closedShadowHosts || [], clickListenerCount: st.clickListenerCount || 0,
    mutations: st.mutations || 0, mutationsAfterSettle: st.mutationsAfterSettle || 0, cls: Math.round((st.cls || 0) * 1000) / 1000,
    runtimeErrors: st.errors || [], challengeMarkers: challengeFound,
    viewport: { width: vw, height: vh },
  };
}`;

export const PAGE_DATA_ARGS = {
  consequentialWords: CONSEQUENTIAL_WORDS,
  consequentialNoise: CONSEQUENTIAL_NOISE,
  dismissWords: DISMISS_WORDS,
  secretPatterns: SECRET_PATTERNS,
  challengeMarkers: CHALLENGE_MARKERS,
  injectionPatterns: INJECTION_PATTERNS,
};
