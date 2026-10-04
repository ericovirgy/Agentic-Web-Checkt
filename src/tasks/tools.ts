import type { Page } from 'playwright';
import {
  CHALLENGE_MARKERS,
  CONSEQUENTIAL_NOISE,
  CONSEQUENTIAL_WORDS,
  DISMISS_WORDS,
} from '../browser/page-data.js';
import { snapshotPage } from '../browser/session.js';
import {
  interactiveNodes,
  type Snapshot,
  type SnapshotNode,
  truncateSnapshot,
} from '../browser/snapshot.js';
import type { BlockerKind, TaskSafety, TaskStep } from '../types.js';

export const SNAPSHOT_CHARS_FOR_AGENT = 24_000;

export interface ToolPolicy {
  safety: TaskSafety;
  allowForms: boolean;
  allowConsequential: boolean;
  origin: string;
}

export class BlockedError extends Error {
  constructor(
    public kind: BlockerKind,
    message: string,
  ) {
    super(message);
  }
}

export function isConsequentialName(name: string): boolean {
  const n = name.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!n || CONSEQUENTIAL_NOISE.some((x) => n === x)) return false;
  return CONSEQUENTIAL_WORDS.some(
    (w) => n === w || n.startsWith(`${w} `) || n.endsWith(` ${w}`) || n.includes(` ${w} `),
  );
}

export function isDismissName(name: string): boolean {
  const n = name.toLowerCase().trim();
  return DISMISS_WORDS.some((w) => n === w || n.startsWith(`${w} `));
}

/** Browser tool surface shared by the baseline and LLM agents. Every call is recorded as a TaskStep. */
export class BrowserTools {
  readonly steps: TaskStep[] = [];
  private snapshot: Snapshot | null = null;
  private lastSnapshotText = '';

  constructor(
    readonly page: Page,
    private policy: ToolPolicy,
  ) {}

  get currentSnapshot(): Snapshot | null {
    return this.snapshot;
  }

  async takeSnapshot(): Promise<Snapshot> {
    this.snapshot = await snapshotPage(this.page);
    this.lastSnapshotText = this.snapshot.text;
    return this.snapshot;
  }

  nodeByRef(ref: string): SnapshotNode | undefined {
    return this.snapshot?.nodes.find((n) => n.ref === ref);
  }

  /** Detect hard blockers in the current page state. */
  async detectBlocker(): Promise<{ kind: BlockerKind; detail: string } | null> {
    const state = await this.page
      .evaluate(
        ({ markers, dismissWords }) => {
          const low =
            `${document.title} ${document.body ? document.body.innerText.slice(0, 5000) : ''}`.toLowerCase();
          const idsClasses = Array.from(document.querySelectorAll('[id],[class]'))
            .slice(0, 1500)
            .map((e) => `${e.id} ${e.className}`.toLowerCase())
            .join(' ');
          const hits = markers.filter((m) => low.includes(m) || idsClasses.includes(m));
          const pw = document.querySelector('input[type=password]');
          const pwVisible = pw ? pw.getBoundingClientRect().height > 0 : false;
          const loginSignal = Array.from(
            document.querySelectorAll('h1,h2,h3,[role=alert],legend,dialog'),
          )
            .map((e) => (e.textContent || '').toLowerCase())
            .some((t) => /sign in|log in|login|logged in|iniciar sess|entrar|autentica/.test(t));
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          let overlayBlocking = '';
          for (const el of Array.from(document.querySelectorAll('body *'))) {
            const cs = getComputedStyle(el);
            if (
              cs.position !== 'fixed' ||
              cs.display === 'none' ||
              cs.visibility === 'hidden' ||
              parseFloat(cs.opacity) === 0
            )
              continue;
            const r = el.getBoundingClientRect();
            const ix = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
            const iy = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
            const coverage = (ix * iy) / (vw * vh);
            const coversCenter =
              r.left <= vw / 2 && r.right >= vw / 2 && r.top <= vh / 2 && r.bottom >= vh / 2;
            if (coverage < 0.3 && !(coversCenter && coverage >= 0.1)) continue;
            const names = Array.from(
              el.querySelectorAll(
                'button,a[href],[role=button],input[type=button],input[type=submit]',
              ),
            ).map((c) =>
              (
                (c as HTMLElement).getAttribute('aria-label') ||
                c.textContent ||
                (c as HTMLInputElement).value ||
                ''
              )
                .trim()
                .toLowerCase(),
            );
            const dismiss = names.some(
              (n) => n && dismissWords.some((w: string) => n === w || n.startsWith(`${w} `)),
            );
            if (!dismiss)
              overlayBlocking = `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''} covering ${Math.round(coverage * 100)}% of the viewport`;
            break;
          }
          return {
            hits,
            pwVisible,
            loginSignal,
            overlayBlocking,
            title: document.title,
            url: location.href,
          };
        },
        { markers: CHALLENGE_MARKERS, dismissWords: DISMISS_WORDS },
      )
      .catch(() => ({
        hits: [] as string[],
        pwVisible: false,
        loginSignal: false,
        overlayBlocking: '',
        title: '',
        url: this.page.url(),
      }));
    if (state.hits.length > 0) {
      const captcha = state.hits.some((h) => /captcha|turnstile|recaptcha/.test(h));
      return { kind: captcha ? 'captcha' : 'bot-wall', detail: state.hits.slice(0, 4).join(', ') };
    }
    if (
      state.pwVisible &&
      (/login|signin|sign-in|auth|session/i.test(state.url) || state.loginSignal)
    ) {
      return {
        kind: 'login-required',
        detail: `password field with sign-in prompt on ${state.url}`,
      };
    }
    if (state.overlayBlocking) {
      return {
        kind: 'consent-overlay',
        detail: `${state.overlayBlocking} with no named dismiss control`,
      };
    }
    return null;
  }

  private async record<T>(
    tool: string,
    args: Record<string, unknown>,
    fn: () => Promise<T>,
    summarise: (r: T) => string,
  ): Promise<T> {
    const started = Date.now();
    const before = this.lastSnapshotText;
    const url = this.page.url();
    const step: TaskStep = {
      index: this.steps.length + 1,
      tool,
      args,
      result: '',
      url,
      durationMs: 0,
      snapshotBefore: truncateSnapshot(before, 1500),
    };
    try {
      const r = await fn();
      step.result = summarise(r).slice(0, 500);
      step.durationMs = Date.now() - started;
      if (tool !== 'snapshot' && tool !== 'finish') {
        await this.page.waitForLoadState('load', { timeout: 5000 }).catch(() => {});
        await this.page.waitForTimeout(300);
        const after = await this.takeSnapshot();
        step.noFeedback = after.text === before && this.page.url() === url;
        if (step.noFeedback) step.result += ' (no visible change)';
      }
      this.steps.push(step);
      return r;
    } catch (e) {
      step.durationMs = Date.now() - started;
      step.error = String((e as Error).message ?? e)
        .split('\n')[0]
        ?.slice(0, 300);
      step.result = `error: ${step.error}`;
      this.steps.push(step);
      throw e;
    }
  }

  private locator(ref: string) {
    if (!/^(f\d+)?e\d+$/.test(ref)) throw new Error(`Invalid ref "${ref}"`);
    return this.page.locator(`aria-ref=${ref}`);
  }

  private async guard(ref: string, action: 'click' | 'type-submit'): Promise<void> {
    const node = this.nodeByRef(ref);
    const name = node?.name ?? '';
    if (
      isConsequentialName(name) &&
      !(this.policy.safety === 'consequential' && this.policy.allowConsequential)
    ) {
      throw new BlockedError(
        'consequential-step',
        `"${name}" is a consequential action; task safety is ${this.policy.safety}`,
      );
    }
    const formInfo = await this.locator(ref)
      .evaluate((el) => {
        const form = (el as HTMLElement).closest('form');
        if (!form) return null;
        const isSubmit = (el as HTMLElement).matches(
          'button:not([type=button]):not([type=reset]),input[type=submit],input[type=image]',
        );
        return { method: (form.getAttribute('method') || 'get').toLowerCase(), isSubmit };
      })
      .catch(() => null);
    const submitting = formInfo && (action === 'type-submit' || formInfo.isSubmit);
    if (
      submitting &&
      formInfo.method !== 'get' &&
      !(
        (this.policy.safety === 'form-submit' || this.policy.safety === 'consequential') &&
        this.policy.allowForms
      )
    ) {
      throw new BlockedError(
        'consequential-step',
        `submitting a ${formInfo.method.toUpperCase()} form requires safety: form-submit and --allow-forms`,
      );
    }
  }

  async snapshotText(): Promise<string> {
    return this.record(
      'snapshot',
      {},
      async () => truncateSnapshot((await this.takeSnapshot()).text, SNAPSHOT_CHARS_FOR_AGENT),
      () => 'snapshot taken',
    );
  }

  async click(ref: string): Promise<string> {
    return this.record(
      'click',
      { ref },
      async () => {
        await this.guard(ref, 'click');
        const node = this.nodeByRef(ref);
        await this.locator(ref).click({ timeout: 8000 });
        return `clicked ${node?.role ?? 'element'} "${node?.name ?? ''}"`;
      },
      (r) => r,
    );
  }

  async type(ref: string, text: string, submit = false): Promise<string> {
    return this.record(
      'type',
      { ref, text, submit },
      async () => {
        if (submit) await this.guard(ref, 'type-submit');
        const loc = this.locator(ref);
        await loc.fill(text, { timeout: 8000 }).catch(async () => {
          await loc.click({ timeout: 8000 });
          await loc.pressSequentially(text, { timeout: 8000 });
        });
        if (submit) await loc.press('Enter', { timeout: 8000 });
        return `typed "${text}"${submit ? ' and pressed Enter' : ''}`;
      },
      (r) => r,
    );
  }

  async select(ref: string, value: string): Promise<string> {
    return this.record(
      'select',
      { ref, value },
      async () => {
        await this.locator(ref)
          .selectOption({ label: value }, { timeout: 8000 })
          .catch(() => this.locator(ref).selectOption(value, { timeout: 8000 }));
        return `selected "${value}"`;
      },
      (r) => r,
    );
  }

  async press(key: string): Promise<string> {
    return this.record(
      'press',
      { key },
      async () => {
        await this.page.keyboard.press(key);
        return `pressed ${key}`;
      },
      (r) => r,
    );
  }

  async navigate(url: string): Promise<string> {
    return this.record(
      'navigate',
      { url },
      async () => {
        const target = new URL(url, this.page.url());
        if (target.origin !== this.policy.origin)
          throw new Error(`navigation outside ${this.policy.origin} is not allowed`);
        const resp = await this.page.goto(target.toString(), {
          waitUntil: 'load',
          timeout: 20_000,
        });
        return `navigated to ${this.page.url()} (HTTP ${resp?.status() ?? '?'})`;
      },
      (r) => r,
    );
  }

  async scroll(direction: 'down' | 'up'): Promise<string> {
    return this.record(
      'scroll',
      { direction },
      async () => {
        await this.page.mouse.wheel(0, direction === 'down' ? 800 : -800);
        return `scrolled ${direction}`;
      },
      (r) => r,
    );
  }

  async back(): Promise<string> {
    return this.record(
      'back',
      {},
      async () => {
        await this.page.goBack({ waitUntil: 'load', timeout: 20_000 });
        return `went back to ${this.page.url()}`;
      },
      (r) => r,
    );
  }

  recordFinish(status: string, reason: string, answer?: string): void {
    this.steps.push({
      index: this.steps.length + 1,
      tool: 'finish',
      args: { status, reason, answer: answer?.slice(0, 500) },
      result: status,
      url: this.page.url(),
      durationMs: 0,
    });
  }

  /** Try to dismiss a blocking overlay with a named dismiss control; returns true when something was clicked. */
  async tryDismissOverlay(): Promise<boolean> {
    const snap = this.snapshot ?? (await this.takeSnapshot());
    const dialogButtons = interactiveNodes(snap).filter(
      (n) => n.role === 'button' && isDismissName(n.name),
    );
    const preferred =
      dialogButtons.find((n) =>
        /reject|decline|no thanks|close|dismiss|rejeitar|fechar/i.test(n.name),
      ) ?? dialogButtons[0];
    if (!preferred?.ref) return false;
    try {
      await this.click(preferred.ref);
      return true;
    } catch {
      return false;
    }
  }
}
