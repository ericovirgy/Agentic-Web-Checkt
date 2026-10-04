/**
 * The LLM agent loop against a scripted OpenAI-compatible mock: the "model" reads the snapshot it is
 * given, clicks the Contact link by ref, then finishes with the e-mail from the contact page.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type FixtureServer, startFixtureServer } from '../../fixtures/server.js';
import { scan } from '../../src/scanner.js';
import type { ScanResult, TaskDefinition } from '../../src/types.js';
import {
  BROWSER_PATH,
  lastMessageText,
  type MockLlmRequest,
  type MockLlmServer,
  openAiToolCallResponse,
  refOfSnapshotLine,
  startMockLlmServer,
} from '../helpers.js';

const TASK: TaskDefinition = {
  name: 'contact',
  goal: 'Find the contact email',
  safety: 'read-only',
  success: [
    { navigated: true },
    { url: { includes: 'contact' } },
    { answer: { must_include: ['northwind.example'] } },
  ],
};

const EMAIL_RE = /[a-z0-9._-]+@northwind\.example/i;

/** Scripted model: click `link "Contact"` from the first snapshot, then finish with the e-mail. */
function contactScript(req: MockLlmRequest): unknown {
  const text = lastMessageText(req.body);
  const messages = req.body.messages as { role: string }[];
  const toolRounds = messages.filter((m) => m.role === 'tool').length;
  if (toolRounds === 0) {
    const ref = refOfSnapshotLine(text, 'link "Contact"');
    if (!ref) throw new Error(`no Contact link in snapshot:\n${text.slice(0, 800)}`);
    return openAiToolCallResponse([{ name: 'click', args: { ref }, id: 'call_click' }], {
      usage: { prompt_tokens: 1200, completion_tokens: 15 },
    });
  }
  const email = EMAIL_RE.exec(text)?.[0];
  if (!email) throw new Error(`no e-mail in tool result:\n${text.slice(0, 800)}`);
  return openAiToolCallResponse(
    [
      {
        name: 'finish',
        args: { status: 'done', reason: 'contact page open', answer: `The email is ${email}` },
        id: 'call_finish',
      },
    ],
    { content: 'Found it.', usage: { prompt_tokens: 1500, completion_tokens: 30 } },
  );
}

/** Scripted model that declares victory without moving. */
function lazyScript(): unknown {
  return openAiToolCallResponse([
    {
      name: 'finish',
      args: { status: 'done', reason: 'looks fine', answer: 'hello@northwind.example' },
    },
  ]);
}

describe('llm agent on the excellent fixture', { sequential: true }, () => {
  let site: FixtureServer;
  let llm: MockLlmServer;
  let script: (req: MockLlmRequest) => unknown = contactScript;

  beforeAll(async () => {
    site = await startFixtureServer('excellent');
    llm = await startMockLlmServer((req) => script(req));
  });
  afterAll(async () => {
    await llm?.close();
    await site?.close();
  });

  const runScan = (tasks: TaskDefinition[]): Promise<ScanResult> =>
    scan({
      url: site.url,
      pages: 1,
      tasks,
      agent: 'llm',
      llm: {
        provider: 'openai',
        model: 'mock-model',
        apiKey: 'test-key',
        baseUrl: llm.openAiBaseUrl,
        maxSteps: 6,
      },
      browserPath: BROWSER_PATH,
    });

  it('clicks Contact, finishes with the e-mail and PASSes', async () => {
    script = contactScript;
    llm.requests.length = 0;
    const result = await runScan([TASK]);

    expect(result.meta.mode).toBe('behavioural');
    expect(result.meta.options).toMatchObject({ agent: 'llm', model: 'mock-model', tasks: 1 });
    const task = result.tasks[0];
    expect(task).toBeDefined();
    expect(task?.verdict, task?.reason).toBe('PASS');
    expect(task?.agent).toBe('llm');
    expect(task?.model).toBe('mock-model');
    expect(task?.finalUrl).toContain('contact.html');
    expect(task?.answer).toMatch(EMAIL_RE);
    expect(task?.assertions.map((a) => a.holds)).toEqual([true, true, true]);

    // steps: the click and the finish are both recorded
    const tools = task?.steps.map((s) => s.tool) ?? [];
    expect(tools).toEqual(['click', 'finish']);
    expect(task?.steps[0]?.args).toEqual({ ref: expect.stringMatching(/^e\d+$/) });
    expect(task?.steps[0]?.result).toContain('clicked link "Contact"');
    expect(task?.steps[0]?.snapshotBefore).toContain('link "Contact"');
    expect(task?.steps[1]?.args).toMatchObject({ status: 'done' });

    // usage accounting comes from the mock's usage blocks
    expect(task?.usage?.calls).toBeGreaterThanOrEqual(2);
    expect(task?.usage).toEqual({ inputTokens: 2700, outputTokens: 45, calls: 2 });

    // the conversation sent to the model was well formed
    expect(llm.requests).toHaveLength(2);
    const first = llm.requests[0] as MockLlmRequest;
    expect(first.path).toBe('/v1/chat/completions');
    expect(first.headers.authorization).toBe('Bearer test-key');
    const firstMessages = first.body.messages as { role: string; content: string }[];
    expect(firstMessages[0]?.role).toBe('system');
    expect(firstMessages[0]?.content).toContain('Safety level: read-only');
    expect(firstMessages[1]?.content).toContain(`Task: ${TASK.goal}`);
    expect(firstMessages[1]?.content).toContain(`Current URL: ${site.url}`);
    expect(
      (first.body.tools as { function: { name: string } }[]).map((t) => t.function.name),
    ).toContain('finish');
    const second = llm.requests[1] as MockLlmRequest;
    const secondMessages = second.body.messages as {
      role: string;
      tool_call_id?: string;
      content: string;
    }[];
    expect(secondMessages.at(-1)).toMatchObject({ role: 'tool', tool_call_id: 'call_click' });
    expect(secondMessages.at(-1)?.content).toContain('URL: ');
    expect(secondMessages.at(-1)?.content).toContain('contact.html');

    // task success feeds the score
    const taskDim = result.dimensions.find((d) => d.dimension === 'task-success');
    expect(taskDim?.score).toBe(100);
  });

  it('FAILs when the model finishes on the start page without satisfying the criteria', async () => {
    script = lazyScript;
    llm.requests.length = 0;
    const result = await runScan([TASK]);
    const task = result.tasks[0];
    expect(task?.verdict).toBe('FAIL');
    expect(task?.reason).toMatch(/success criteria do not hold/);
    expect(task?.finalUrl).toBe(site.url);
    expect(task?.steps.map((s) => s.tool)).toEqual(['finish']);
    expect(task?.answer).toBe('hello@northwind.example');
    const holds = Object.fromEntries(
      task?.assertions.map((a) => [Object.keys(a.assertion)[0], a.holds]) ?? [],
    );
    expect(holds).toEqual({ navigated: false, url: false, answer: true });
    expect(task?.usage?.calls).toBe(1);
    expect(llm.requests).toHaveLength(1);
    expect(result.dimensions.find((d) => d.dimension === 'task-success')?.score).toBe(0);
  });
});
