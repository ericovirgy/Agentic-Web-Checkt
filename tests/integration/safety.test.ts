/**
 * Safety gates of the task runner: consequential controls, POST forms and --allow-forms.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type FixtureServer, startFixtureServer } from '../../fixtures/server.js';
import { scan } from '../../src/scanner.js';
import type { ScanOptions, TaskDefinition, TaskResult } from '../../src/types.js';
import { BROWSER_PATH, type StaticServer, startStaticServer } from '../helpers.js';

const SCAN_TIMEOUT_MS = 120_000;

async function runTask(
  url: string,
  task: TaskDefinition,
  extra: Partial<ScanOptions> = {},
): Promise<TaskResult> {
  const result = await scan({
    url,
    pages: 1,
    tasks: [task],
    agent: 'baseline',
    browserPath: BROWSER_PATH,
    ...extra,
  });
  const t = result.tasks[0];
  if (!t) throw new Error('no task result');
  return t;
}

describe('unsafe fixture: consequential actions', { sequential: true }, () => {
  let server: FixtureServer;
  beforeAll(async () => {
    server = await startFixtureServer('unsafe');
  });
  afterAll(async () => {
    await server?.close();
  });

  it(
    'a read-only task is BLOCKED before clicking "Transfer funds"',
    async () => {
      const t = await runTask(server.url, {
        name: 'transfer',
        goal: 'Transfer funds',
        safety: 'read-only',
        success: [{ text: { includes: 'Transferred' } }],
      });
      expect(t.verdict, t.reason).toBe('BLOCKED');
      expect(['consequential-step', 'login-required']).toContain(t.blocker);
      expect(t.assertions.every((a) => !a.holds)).toBe(true);
      if (t.blocker === 'consequential-step') {
        expect(t.reason).toContain('Transfer funds');
        const click = t.steps.find((s) => s.tool === 'click');
        expect(click?.error).toMatch(/consequential action/);
      }
    },
    SCAN_TIMEOUT_MS,
  );

  it(
    'a consequential task is still BLOCKED without --allow-consequential',
    async () => {
      const t = await runTask(server.url, {
        name: 'transfer',
        goal: 'Transfer funds',
        safety: 'consequential',
        success: [{ text: { includes: 'Transferred' } }],
      });
      expect(t.verdict, t.reason).toBe('BLOCKED');
      expect(['consequential-step', 'login-required']).toContain(t.blocker);
    },
    SCAN_TIMEOUT_MS,
  );
});

/** A contact page modelled on the "excellent" fixture, but with a POST form the server answers. */
const CONTACT_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Contact | Northwind Bikes</title></head>
<body>
<header><nav aria-label="Main"><ul><li><a href="/">Home</a></li><li><a href="/contact.html">Contact</a></li></ul></nav></header>
<main id="main">
<h1>Contact Northwind Bikes</h1>
<p>Email <a href="mailto:hello@northwind.example">hello@northwind.example</a>.</p>
<section aria-labelledby="form-heading">
<h2 id="form-heading">Send us a message</h2>
<form id="contact-form" action="/contact.html" method="post" aria-labelledby="form-heading">
<p><label for="name">Your name</label> <input type="text" id="name" name="name" autocomplete="name" value="Alex Example"></p>
<p><label for="message">Message</label> <textarea id="message" name="message" rows="3">Hello from the test suite</textarea></p>
<button type="submit">Send message</button>
</form>
</section>
</main>
</body></html>`;

const HOME_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Home | Northwind Bikes</title></head>
<body><header><nav aria-label="Main"><ul><li><a href="/">Home</a></li><li><a href="/contact.html">Contact</a></li></ul></nav></header>
<main><h1>Northwind Bikes</h1><p>Bikes built for every road.</p></main></body></html>`;

const THANKS_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Thanks | Northwind Bikes</title></head>
<body><main><h1>Thank you</h1><p role="status">Message sent. We reply within two working days.</p></main></body></html>`;

const FORM_TASK: TaskDefinition = {
  name: 'send-message',
  goal: 'Send a message through the contact form',
  safety: 'form-submit',
  start: '/contact.html',
  hints: ['send message'],
  success: [{ text: { includes: 'Message sent' } }],
};

describe('POST contact form: --allow-forms gate', { sequential: true }, () => {
  let server: StaticServer;
  beforeAll(async () => {
    server = await startStaticServer(
      { '/': HOME_HTML, '/contact.html': CONTACT_HTML },
      (path) => (path === '/contact.html' ? { body: THANKS_HTML } : { status: 404, body: 'no' }),
    );
  });
  afterAll(async () => {
    await server?.close();
  });

  it(
    'is BLOCKED without allowForms',
    async () => {
      const posts = server.requests.filter((r) => r.method === 'POST').length;
      const t = await runTask(server.url, FORM_TASK);
      expect(t.verdict, t.reason).toBe('BLOCKED');
      expect(t.blocker).toBe('consequential-step');
      expect(t.reason).toMatch(/submitting a POST form requires safety: form-submit and --allow-forms/);
      expect(t.finalUrl).toContain('contact.html');
      // the form was never submitted
      expect(server.requests.filter((r) => r.method === 'POST').length).toBe(posts);
    },
    SCAN_TIMEOUT_MS,
  );

  it(
    'is BLOCKED when allowForms is set but the task is read-only',
    async () => {
      const t = await runTask(server.url, { ...FORM_TASK, safety: 'read-only' }, { allowForms: true });
      expect(t.verdict, t.reason).toBe('BLOCKED');
      expect(t.blocker).toBe('consequential-step');
    },
    SCAN_TIMEOUT_MS,
  );

  it(
    'is not BLOCKED with allowForms and safety form-submit (the form is submitted)',
    async () => {
      const posts = server.requests.filter((r) => r.method === 'POST').length;
      const t = await runTask(server.url, FORM_TASK, { allowForms: true });
      expect(t.verdict, t.reason).not.toBe('BLOCKED');
      expect(t.blocker).toBeUndefined();
      expect(server.requests.filter((r) => r.method === 'POST').length).toBe(posts + 1);
      expect(t.verdict).toBe('PASS');
      expect(t.steps.some((s) => s.tool === 'click' && !s.error)).toBe(true);
    },
    SCAN_TIMEOUT_MS,
  );
});

describe('excellent fixture: GET contact form', { sequential: true }, () => {
  let server: FixtureServer;
  beforeAll(async () => {
    server = await startFixtureServer('excellent');
  });
  afterAll(async () => {
    await server?.close();
  });

  it(
    'a GET form is never gated: the task is not BLOCKED even without allowForms',
    async () => {
      const t = await runTask(server.url, {
        name: 'contact-form',
        goal: 'Send a message through the contact form',
        safety: 'form-submit',
        start: '/contact.html',
        hints: ['send message'],
        max_steps: 4,
        success: [{ url: { includes: 'contact.html' } }, { element: { role: 'button', name: 'Send message' } }],
      });
      expect(t.verdict, t.reason).not.toBe('BLOCKED');
      expect(t.blocker).toBeUndefined();
      const click = t.steps.find((s) => s.tool === 'click');
      expect(click?.error).toBeUndefined();
    },
    SCAN_TIMEOUT_MS,
  );
});
