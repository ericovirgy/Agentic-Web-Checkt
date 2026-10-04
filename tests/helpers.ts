/**
 * Shared test helpers: fixture loading, temp dirs, a scripted mock LLM server, a tiny static
 * HTTP server for ad-hoc pages, and a hand-built minimal ScanResult.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listFixtureSites } from '../fixtures/server.js';
import { parseTaskDefinition } from '../src/tasks/archetypes.js';
import type {
  CheckResult,
  CheckStatus,
  CheckWeight,
  Dimension,
  ScanResult,
  TaskDefinition,
  TaskResult,
  TaskVerdict,
} from '../src/types.js';

export const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const FIXTURE_SITES_DIR = join(ROOT, 'fixtures', 'sites');

/**
 * Chromium executable for this environment. In CI the variable is absent and Playwright's own
 * Chromium is used (scan() receives `browserPath: undefined`).
 */
export const BROWSER_PATH: string | undefined = process.env.AWC_BROWSER_PATH || undefined;

/* ------------------------------------------------------------------ fixtures */

export interface FixtureTaskSpec {
  name: string;
  goal: string;
  expect: TaskVerdict;
  safety?: string;
  success: unknown[];
  data?: Record<string, string>;
  hints?: string[];
}

export interface FixtureSpec {
  name: string;
  description: string;
  pages: string[];
  expect: Record<string, CheckStatus>;
  notes?: Record<string, string>;
  tasks: FixtureTaskSpec[];
  scanPages?: number;
}

export function fixtureSites(): string[] {
  return listFixtureSites();
}

export function loadFixture(site: string): FixtureSpec {
  const file = join(FIXTURE_SITES_DIR, site, 'fixture.json');
  return JSON.parse(readFileSync(file, 'utf8')) as FixtureSpec;
}

export function fixtureTasks(fixture: FixtureSpec): TaskDefinition[] {
  return fixture.tasks.map((t, i) =>
    parseTaskDefinition(t, `${fixture.name}/fixture.json tasks[${i}]`),
  );
}

export function readExampleResult(name: string): ScanResult {
  const file = join(ROOT, 'docs', 'examples', `${name}.json`);
  return JSON.parse(readFileSync(file, 'utf8')) as ScanResult;
}

/* ------------------------------------------------------------------ temp dirs */

export function makeTmpDir(prefix = 'awc-test-'): { path: string; cleanup(): void } {
  const path = mkdtempSync(join(tmpdir(), prefix));
  return { path, cleanup: () => rmSync(path, { recursive: true, force: true }) };
}

/* ------------------------------------------------------------------ mock LLM server */

export interface MockLlmRequest {
  index: number;
  path: string;
  method: string;
  headers: IncomingHttpHeaders;
  body: Record<string, unknown>;
}

export interface MockLlmResponse {
  status?: number;
  /** Object → JSON encoded; string → sent verbatim (to simulate non-JSON bodies). */
  body: unknown;
}

export type MockLlmScript = (req: MockLlmRequest) => MockLlmResponse | unknown;

export interface MockLlmServer {
  /** Base URL without trailing slash, e.g. http://127.0.0.1:12345 */
  url: string;
  /** OpenAI-style base URL (the provider appends /chat/completions). */
  openAiBaseUrl: string;
  /** Anthropic-style base URL (the provider appends /v1/messages). */
  anthropicBaseUrl: string;
  requests: MockLlmRequest[];
  close(): Promise<void>;
}

function isMockResponse(v: unknown): v is MockLlmResponse {
  return (
    !!v &&
    typeof v === 'object' &&
    'body' in (v as Record<string, unknown>) &&
    Object.keys(v as Record<string, unknown>).every((k) => k === 'body' || k === 'status')
  );
}

/**
 * Start an HTTP server that records every POST and answers with whatever the script returns.
 * The script may return a plain object (sent as JSON with status 200) or a MockLlmResponse.
 */
export async function startMockLlmServer(script: MockLlmScript): Promise<MockLlmServer> {
  const requests: MockLlmRequest[] = [];
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      let body: Record<string, unknown> = {};
      try {
        body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      } catch {
        body = { __raw: raw };
      }
      const record: MockLlmRequest = {
        index: requests.length,
        path: req.url ?? '/',
        method: req.method ?? 'POST',
        headers: req.headers,
        body,
      };
      requests.push(record);
      let out: MockLlmResponse;
      try {
        const r = script(record);
        out = isMockResponse(r) ? r : { body: r };
      } catch (e) {
        out = { status: 500, body: { error: String((e as Error).message ?? e) } };
      }
      const payload = typeof out.body === 'string' ? out.body : JSON.stringify(out.body);
      res.writeHead(out.status ?? 200, {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload),
      });
      res.end(payload);
    });
  });
  await new Promise<void>((ok, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => ok());
  });
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('mock LLM server did not bind');
  const url = `http://127.0.0.1:${addr.port}`;
  return {
    url,
    openAiBaseUrl: `${url}/v1`,
    anthropicBaseUrl: url,
    requests,
    close: () =>
      new Promise<void>((ok, fail) => {
        server.closeAllConnections?.();
        server.close((e) => (e ? fail(e) : ok()));
      }),
  };
}

export interface ScriptedToolCall {
  name: string;
  args: Record<string, unknown>;
  id?: string;
}

/** Build an OpenAI chat.completions response carrying the given tool calls. */
export function openAiToolCallResponse(
  calls: ScriptedToolCall[],
  opts: {
    content?: string | null;
    usage?: { prompt_tokens: number; completion_tokens: number };
  } = {},
): Record<string, unknown> {
  return {
    id: 'chatcmpl-mock',
    object: 'chat.completion',
    model: 'mock-model',
    choices: [
      {
        index: 0,
        finish_reason: calls.length ? 'tool_calls' : 'stop',
        message: {
          role: 'assistant',
          content: opts.content ?? null,
          tool_calls: calls.map((c, i) => ({
            id: c.id ?? `call_${i}`,
            type: 'function',
            function: { name: c.name, arguments: JSON.stringify(c.args) },
          })),
        },
      },
    ],
    usage: opts.usage ?? { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
  };
}

/** Build an Anthropic messages response carrying the given tool_use blocks. */
export function anthropicToolUseResponse(
  calls: ScriptedToolCall[],
  opts: { text?: string; usage?: { input_tokens: number; output_tokens: number } } = {},
): Record<string, unknown> {
  const content: unknown[] = [];
  if (opts.text) content.push({ type: 'text', text: opts.text });
  for (const [i, c] of calls.entries())
    content.push({ type: 'tool_use', id: c.id ?? `toolu_${i}`, name: c.name, input: c.args });
  return {
    id: 'msg_mock',
    type: 'message',
    role: 'assistant',
    model: 'mock-model',
    content,
    stop_reason: calls.length ? 'tool_use' : 'end_turn',
    usage: opts.usage ?? { input_tokens: 100, output_tokens: 20 },
  };
}

/** Text of the most recent user/tool message in an OpenAI-style messages array. */
export function lastMessageText(body: Record<string, unknown>): string {
  const messages = (body.messages as { role: string; content?: unknown }[] | undefined) ?? [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m) continue;
    if (m.role === 'user' || m.role === 'tool') {
      if (typeof m.content === 'string') return m.content;
      if (Array.isArray(m.content))
        return m.content
          .map((b: { text?: string; content?: string }) => b.text ?? b.content ?? '')
          .join('\n');
    }
  }
  return '';
}

/** Find the ref of a snapshot line such as `- link "Contact" [ref=e16]`. */
export function refOfSnapshotLine(snapshot: string, needle: string): string | undefined {
  for (const line of snapshot.split('\n')) {
    if (!line.includes(needle)) continue;
    const m = /\[ref=((?:f\d+)?e\d+)\]/.exec(line);
    if (m) return m[1];
  }
  return undefined;
}

/* ------------------------------------------------------------------ static mini server */

export interface StaticRoute {
  status?: number;
  type?: string;
  body: string;
}

export interface StaticServer {
  url: string;
  requests: { method: string; path: string; body: string }[];
  close(): Promise<void>;
}

/**
 * Serve a handful of in-memory pages; keys are paths like "/" or "/contact.html".
 * `onPost` lets a test answer form submissions (default: 405).
 */
export async function startStaticServer(
  routes: Record<string, StaticRoute | string>,
  onPost?: (path: string, body: string) => StaticRoute,
): Promise<StaticServer> {
  const requests: StaticServer['requests'] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      const path = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
      requests.push({ method: req.method ?? 'GET', path, body });
      let route: StaticRoute | undefined;
      if (req.method === 'POST') route = onPost?.(path, body) ?? { status: 405, body: 'nope' };
      else {
        const r = routes[path];
        route = r === undefined ? undefined : typeof r === 'string' ? { body: r } : r;
      }
      if (!route) {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('Not Found');
        return;
      }
      res.writeHead(route.status ?? 200, {
        'content-type': route.type ?? 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      });
      res.end(route.body);
    });
  });
  await new Promise<void>((ok, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => ok());
  });
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('static server did not bind');
  return {
    url: `http://127.0.0.1:${addr.port}/`,
    requests,
    close: () =>
      new Promise<void>((ok, fail) => {
        server.closeAllConnections?.();
        server.close((e) => (e ? fail(e) : ok()));
      }),
  };
}

/* ------------------------------------------------------------------ synthetic results */

export function makeCheck(partial: Partial<CheckResult> & { id: string }): CheckResult {
  const status: CheckStatus = partial.status ?? 'pass';
  // `score: undefined` passed explicitly is honoured (a check with a status but no score).
  const score =
    'score' in partial
      ? partial.score
      : status === 'pass'
        ? 1
        : status === 'warn'
          ? 0.5
          : status === 'fail'
            ? 0
            : undefined;
  return {
    title: partial.title ?? `Check ${partial.id}`,
    dimension: (partial.dimension ?? 'perception') as Dimension,
    weight: (partial.weight ?? 3) as CheckWeight,
    status,
    score,
    summary: partial.summary ?? `summary of ${partial.id}`,
    rationale: partial.rationale ?? 'because',
    references: partial.references ?? [],
    remediation: partial.remediation,
    evidence: partial.evidence ?? [],
    metrics: partial.metrics,
    pages: partial.pages,
    durationMs: partial.durationMs ?? 1,
    error: partial.error,
    id: partial.id,
  };
}

export function makeTask(partial: Partial<TaskResult> & { name: string }): TaskResult {
  return {
    goal: partial.goal ?? `goal of ${partial.name}`,
    verdict: partial.verdict ?? 'PASS',
    reason: partial.reason ?? 'ok',
    agent: partial.agent ?? 'baseline',
    model: partial.model,
    safety: partial.safety ?? 'read-only',
    startUrl: partial.startUrl ?? 'http://127.0.0.1:1/',
    finalUrl: partial.finalUrl ?? 'http://127.0.0.1:1/contact.html',
    finalTitle: partial.finalTitle ?? 'Contact',
    steps: partial.steps ?? [],
    assertions: partial.assertions ?? [],
    answer: partial.answer,
    blocker: partial.blocker,
    screenshots: partial.screenshots ?? [],
    consoleErrors: partial.consoleErrors ?? [],
    durationMs: partial.durationMs ?? 10,
    usage: partial.usage,
    error: partial.error,
    name: partial.name,
  };
}

/** A small but complete ScanResult with one fail, one warn, one pass, one na and one task. */
export function minimalScanResult(overrides: Partial<ScanResult> = {}): ScanResult {
  const checks: CheckResult[] = [
    makeCheck({
      id: 'control-accessible-name',
      title: 'Controls have an accessible name',
      dimension: 'perception',
      weight: 10,
      status: 'fail',
      summary: '3 of 12 controls have no name <b>&"</b>',
      remediation: 'Add aria-label to icon buttons',
      evidence: [{ url: 'http://127.0.0.1:1/', element: 'button <svg>', observed: 'unnamed' }],
      metrics: { interactive: 12, unnamed: 3 },
    }),
    makeCheck({
      id: 'sitemap',
      title: 'Sitemap present',
      dimension: 'navigation',
      weight: 3,
      status: 'warn',
      summary: 'sitemap.xml missing',
      remediation: 'Publish a sitemap.xml',
    }),
    makeCheck({
      id: 'page-load',
      title: 'Page loads',
      dimension: 'reliability',
      weight: 10,
      status: 'pass',
      summary: 'HTTP 200 in 120 ms',
    }),
    makeCheck({
      id: 'webmcp',
      title: 'WebMCP',
      dimension: 'machine-interfaces',
      weight: 3,
      status: 'na',
      summary: 'No WebMCP tools',
    }),
  ];
  const tasks: TaskResult[] = [
    makeTask({
      name: 'find-contact-email',
      goal: 'Find the email address <for> contacting "Northwind"',
      verdict: 'PASS',
      steps: [
        {
          index: 1,
          tool: 'click',
          args: { ref: 'e16' },
          result: 'clicked link "Contact"',
          url: 'http://127.0.0.1:1/',
          durationMs: 50,
        },
      ],
      assertions: [{ assertion: { url: { includes: 'contact' } }, holds: true, observed: 'url' }],
      answer: 'hello@northwind.example',
    }),
  ];
  const base: ScanResult = {
    meta: {
      tool: 'agentic-web-check',
      version: '0.1.0-test',
      methodology: '1',
      schema: '1',
      mode: 'behavioural',
      startedAt: '2026-10-04T10:00:00.000Z',
      finishedAt: '2026-10-04T10:00:12.345Z',
      durationMs: 12345,
      url: 'http://127.0.0.1:1/?q=<script>alert(1)</script>&x="y"',
      browser: { name: 'chromium', version: '141.0', userAgent: 'UA AgenticWebCheck/0.1.0-test' },
      options: { pages: 3, agent: 'baseline', model: null, tasks: 1 },
      node: 'v22',
    },
    overall: 61,
    dimensions: [
      {
        dimension: 'perception',
        label: 'PERCEPTION',
        score: 0,
        weight: 14,
        checks: ['control-accessible-name'],
        passed: 0,
        warned: 0,
        failed: 1,
      },
      {
        dimension: 'navigation',
        label: 'NAVIGATION',
        score: 50,
        weight: 10.5,
        checks: ['sitemap'],
        passed: 0,
        warned: 1,
        failed: 0,
      },
      {
        dimension: 'interaction',
        label: 'INTERACTION',
        score: null,
        weight: 14,
        checks: [],
        passed: 0,
        warned: 0,
        failed: 0,
      },
      {
        dimension: 'machine-interfaces',
        label: 'MACHINE INTERFACES',
        score: null,
        weight: 7,
        checks: ['webmcp'],
        passed: 0,
        warned: 0,
        failed: 0,
      },
      {
        dimension: 'reliability',
        label: 'RELIABILITY',
        score: 100,
        weight: 10.5,
        checks: ['page-load'],
        passed: 1,
        warned: 0,
        failed: 0,
      },
      {
        dimension: 'safety',
        label: 'SAFETY',
        score: null,
        weight: 14,
        checks: [],
        passed: 0,
        warned: 0,
        failed: 0,
      },
      {
        dimension: 'task-success',
        label: 'TASK SUCCESS',
        score: 100,
        weight: 30,
        checks: ['task:find-contact-email'],
        passed: 1,
        warned: 0,
        failed: 0,
      },
    ],
    checks,
    tasks,
    pages: [
      {
        url: 'http://127.0.0.1:1/',
        finalUrl: 'http://127.0.0.1:1/',
        status: 200,
        title: 'Home <Northwind>',
        loadMs: 120,
        interactiveCount: 12,
        snapshotChars: 2400,
        consoleErrors: 0,
      },
    ],
    suggestedFixes: [
      {
        checkId: 'control-accessible-name',
        title: 'Controls have an accessible name',
        remediation: 'Add aria-label to icon buttons',
        weight: 10,
      },
      {
        checkId: 'sitemap',
        title: 'Sitemap present',
        remediation: 'Publish a sitemap.xml',
        weight: 3,
      },
    ],
  };
  return { ...base, ...overrides };
}

/* ------------------------------------------------------------------ XML well-formedness */

/**
 * Minimal XML well-formedness check (enough for an SVG badge): balanced tags, quoted attributes,
 * no stray `&` and no raw `<` in text. Returns null when fine, otherwise a reason.
 */
export function xmlProblem(xml: string): string | null {
  const stack: string[] = [];
  let i = 0;
  const n = xml.length;
  while (i < n) {
    const lt = xml.indexOf('<', i);
    const text = lt < 0 ? xml.slice(i) : xml.slice(i, lt);
    const amp = /&(?![a-zA-Z]+;|#\d+;|#x[0-9a-fA-F]+;)/.exec(text);
    if (amp)
      return `unescaped & in text near "${text.slice(Math.max(0, amp.index - 10), amp.index + 10)}"`;
    if (text.includes('>') && stack.length === 0 && text.trim() !== '')
      return `text outside root element: "${text.trim().slice(0, 30)}"`;
    if (lt < 0) break;
    const gt = xml.indexOf('>', lt);
    if (gt < 0) return 'unterminated tag';
    const tag = xml.slice(lt + 1, gt);
    i = gt + 1;
    if (tag.startsWith('?') || tag.startsWith('!')) continue;
    if (tag.startsWith('/')) {
      const name = tag.slice(1).trim();
      const open = stack.pop();
      if (open !== name) return `closing </${name}> does not match <${open ?? 'nothing'}>`;
      continue;
    }
    const selfClosing = tag.endsWith('/');
    const body = selfClosing ? tag.slice(0, -1) : tag;
    const m = /^([A-Za-z_][\w:.-]*)([\s\S]*)$/.exec(body);
    if (!m) return `bad tag <${tag.slice(0, 20)}>`;
    const attrs = m[2] ?? '';
    const attrRe = /^(?:\s+[A-Za-z_:][\w:.-]*\s*=\s*(?:"[^"<]*"|'[^'<]*'))*\s*$/;
    if (!attrRe.test(attrs)) return `bad attributes in <${m[1]}${attrs.slice(0, 40)}>`;
    if (!selfClosing) stack.push(m[1] as string);
  }
  if (stack.length) return `unclosed <${stack[stack.length - 1]}>`;
  return null;
}
