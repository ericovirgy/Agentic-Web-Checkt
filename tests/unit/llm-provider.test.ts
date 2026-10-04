import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  AnthropicProvider,
  createProvider,
  OpenAiCompatibleProvider,
  resolveLlmOptions,
  type ToolDef,
  type Turn,
} from '../../src/tasks/llm-provider.js';
import {
  anthropicToolUseResponse,
  type MockLlmRequest,
  type MockLlmResponse,
  openAiToolCallResponse,
  startMockLlmServer,
} from '../helpers.js';

const TOOLS: ToolDef[] = [
  {
    name: 'click',
    description: 'Click an element by its ref.',
    parameters: {
      type: 'object',
      properties: { ref: { type: 'string' } },
      required: ['ref'],
      additionalProperties: false,
    },
  },
  {
    name: 'finish',
    description: 'End the task.',
    parameters: {
      type: 'object',
      properties: { status: { type: 'string' }, reason: { type: 'string' } },
      required: ['status', 'reason'],
      additionalProperties: false,
    },
  },
];

const SYSTEM = 'You are a careful web agent.';

/** A conversation after one tool round-trip. */
const TURNS: Turn[] = [
  { role: 'user', text: 'Task: find the contact page\nSnapshot:\n- link "Contact" [ref=e16]' },
  { role: 'assistant', text: 'I will click Contact.', toolCalls: [{ id: 'call_a', name: 'click', args: { ref: 'e16' } }] },
  { role: 'tool', toolResults: [{ id: 'call_a', name: 'click', result: 'clicked link "Contact"\nURL: /contact.html' }] },
];

// The script is swapped per test through this mutable reference.
let script: (req: MockLlmRequest) => MockLlmResponse | unknown = () => openAiToolCallResponse([]);
let server: Awaited<ReturnType<typeof startMockLlmServer>>;

beforeAll(async () => {
  server = await startMockLlmServer((req) => script(req));
});
afterAll(async () => {
  await server.close();
});
afterEach(() => {
  server.requests.length = 0;
  vi.unstubAllEnvs();
});

describe('OpenAiCompatibleProvider', () => {
  const make = (apiKey?: string) =>
    new OpenAiCompatibleProvider({
      provider: 'openai',
      model: 'mock-gpt',
      apiKey,
      baseUrl: server.openAiBaseUrl,
    });

  it('posts to /chat/completions with the right body shape and auth header', async () => {
    script = () => openAiToolCallResponse([{ name: 'click', args: { ref: 'e16' }, id: 'call_1' }]);
    const provider = make('sk-test-key');
    const out = await provider.complete(SYSTEM, TURNS.slice(0, 1), TOOLS);

    expect(server.requests).toHaveLength(1);
    const req = server.requests[0] as MockLlmRequest;
    expect(req.method).toBe('POST');
    expect(req.path).toBe('/v1/chat/completions');
    expect(req.headers['content-type']).toBe('application/json');
    expect(req.headers.authorization).toBe('Bearer sk-test-key');

    const body = req.body;
    expect(body.model).toBe('mock-gpt');
    expect(body.temperature).toBe(0);
    expect(body.tool_choice).toBeUndefined();
    expect(body.tools).toEqual(
      TOOLS.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      })),
    );
    expect(body.messages).toEqual([
      { role: 'system', content: SYSTEM },
      { role: 'user', content: TURNS[0]?.text },
    ]);

    expect(out.text).toBe('');
    expect(out.toolCalls).toEqual([{ id: 'call_1', name: 'click', args: { ref: 'e16' } }]);
  });

  it('threads assistant tool calls and tool results in the OpenAI format', async () => {
    script = () =>
      openAiToolCallResponse([{ name: 'finish', args: { status: 'done', reason: 'found it' } }], {
        content: 'Done.',
      });
    const out = await make().complete(SYSTEM, TURNS, TOOLS);
    const body = (server.requests[0] as MockLlmRequest).body;
    expect(body.messages).toEqual([
      { role: 'system', content: SYSTEM },
      { role: 'user', content: TURNS[0]?.text },
      {
        role: 'assistant',
        content: 'I will click Contact.',
        tool_calls: [
          { id: 'call_a', type: 'function', function: { name: 'click', arguments: '{"ref":"e16"}' } },
        ],
      },
      { role: 'tool', tool_call_id: 'call_a', content: 'clicked link "Contact"\nURL: /contact.html' },
    ]);
    expect((server.requests[0] as MockLlmRequest).headers.authorization).toBeUndefined();
    expect(out.text).toBe('Done.');
    expect(out.toolCalls).toEqual([
      { id: 'call_0', name: 'finish', args: { status: 'done', reason: 'found it' } },
    ]);
  });

  it('sends content: null for an assistant turn without text', async () => {
    script = () => openAiToolCallResponse([]);
    const turns: Turn[] = [
      { role: 'user', text: 'hi' },
      { role: 'assistant', toolCalls: [{ id: 'c', name: 'click', args: {} }] },
      { role: 'tool', toolResults: [{ id: 'c', name: 'click', result: 'ok' }] },
    ];
    await make().complete(SYSTEM, turns, TOOLS);
    const messages = (server.requests[0] as MockLlmRequest).body.messages as Record<string, unknown>[];
    expect(messages[2]).toMatchObject({ role: 'assistant', content: null });
  });

  it('forces a tool with tool_choice', async () => {
    script = () => openAiToolCallResponse([{ name: 'finish', args: { status: 'gave_up', reason: 'x' } }]);
    await make().complete(SYSTEM, TURNS, TOOLS.filter((t) => t.name === 'finish'), 'finish');
    const body = (server.requests[0] as MockLlmRequest).body;
    expect(body.tool_choice).toEqual({ type: 'function', function: { name: 'finish' } });
    expect((body.tools as unknown[]).length).toBe(1);
  });

  it('accumulates usage across calls and counts them', async () => {
    let n = 0;
    script = () =>
      openAiToolCallResponse([], {
        content: `reply ${++n}`,
        usage: { prompt_tokens: 100 * n, completion_tokens: 10 * n },
      });
    const provider = make();
    expect(provider.usage).toEqual({ inputTokens: 0, outputTokens: 0, calls: 0 });
    const a = await provider.complete(SYSTEM, TURNS, TOOLS);
    const b = await provider.complete(SYSTEM, TURNS, TOOLS);
    expect(a.text).toBe('reply 1');
    expect(b.text).toBe('reply 2');
    expect(b.toolCalls).toEqual([]);
    expect(provider.usage).toEqual({ inputTokens: 300, outputTokens: 30, calls: 2 });
    expect(provider.model).toBe('mock-gpt');
  });

  it('tolerates missing usage, ids and malformed arguments', async () => {
    script = () => ({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              { function: { name: 'click', arguments: 'not json' } },
              { id: 'call_x', function: { name: 'finish', arguments: { status: 'done' } } },
            ],
          },
        },
      ],
    });
    const provider = make();
    const out = await provider.complete(SYSTEM, TURNS, TOOLS);
    expect(provider.usage).toEqual({ inputTokens: 0, outputTokens: 0, calls: 1 });
    expect(out.text).toBe('');
    expect(out.toolCalls).toHaveLength(2);
    expect(out.toolCalls[0]).toMatchObject({ name: 'click', args: {} });
    expect(out.toolCalls[0]?.id).toMatch(/^call_\d+_0$/);
    expect(out.toolCalls[1]).toEqual({ id: 'call_x', name: 'finish', args: { status: 'done' } });
  });

  it('returns no tool calls for an empty choices list', async () => {
    script = () => ({ choices: [] });
    const out = await make().complete(SYSTEM, TURNS, TOOLS);
    expect(out).toEqual({ text: '', toolCalls: [] });
  });

  it('throws on HTTP errors with the status and body excerpt', async () => {
    script = () => ({ status: 429, body: { error: { message: 'rate limited' } } });
    await expect(make().complete(SYSTEM, TURNS, TOOLS)).rejects.toThrow(
      /LLM provider HTTP 429: .*rate limited/,
    );
  });

  it('throws on non-JSON bodies', async () => {
    script = () => ({ status: 200, body: '<html>oops</html>' });
    await expect(make().complete(SYSTEM, TURNS, TOOLS)).rejects.toThrow(
      /LLM provider returned non-JSON: <html>oops/,
    );
  });
});

describe('AnthropicProvider', () => {
  const make = (apiKey?: string) =>
    new AnthropicProvider({
      provider: 'anthropic',
      model: 'claude-mock',
      apiKey,
      baseUrl: server.anthropicBaseUrl,
    });

  it('posts to /v1/messages with Anthropic headers and body shape', async () => {
    script = () =>
      anthropicToolUseResponse([{ name: 'click', args: { ref: 'e16' }, id: 'toolu_1' }], {
        text: 'Clicking.',
      });
    const provider = make('ant-key');
    const out = await provider.complete(SYSTEM, TURNS.slice(0, 1), TOOLS);

    const req = server.requests[0] as MockLlmRequest;
    expect(req.path).toBe('/v1/messages');
    expect(req.headers['anthropic-version']).toBe('2023-06-01');
    expect(req.headers['x-api-key']).toBe('ant-key');
    expect(req.headers.authorization).toBeUndefined();

    const body = req.body;
    expect(body.model).toBe('claude-mock');
    expect(body.system).toBe(SYSTEM);
    expect(body.max_tokens).toBeGreaterThan(0);
    expect(body.temperature).toBe(0);
    expect(body.tools).toEqual(
      TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })),
    );
    expect(body.messages).toEqual([{ role: 'user', content: TURNS[0]?.text }]);

    expect(out.text).toBe('Clicking.');
    expect(out.toolCalls).toEqual([{ id: 'toolu_1', name: 'click', args: { ref: 'e16' } }]);
  });

  it('threads tool_use and tool_result blocks', async () => {
    script = () => anthropicToolUseResponse([]);
    await make().complete(SYSTEM, TURNS, TOOLS);
    const body = (server.requests[0] as MockLlmRequest).body;
    expect(body.messages).toEqual([
      { role: 'user', content: TURNS[0]?.text },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'I will click Contact.' },
          { type: 'tool_use', id: 'call_a', name: 'click', input: { ref: 'e16' } },
        ],
      },
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'call_a', content: 'clicked link "Contact"\nURL: /contact.html' },
        ],
      },
    ]);
    expect((server.requests[0] as MockLlmRequest).headers['x-api-key']).toBeUndefined();
  });

  it('omits empty assistant text blocks', async () => {
    script = () => anthropicToolUseResponse([]);
    await make().complete(
      SYSTEM,
      [
        { role: 'user', text: 'hi' },
        { role: 'assistant', text: '', toolCalls: [{ id: 't', name: 'click', args: {} }] },
        { role: 'tool', toolResults: [{ id: 't', name: 'click', result: 'ok' }] },
      ],
      TOOLS,
    );
    const messages = (server.requests[0] as MockLlmRequest).body.messages as { content: unknown[] }[];
    expect(messages[1]?.content).toEqual([{ type: 'tool_use', id: 't', name: 'click', input: {} }]);
  });

  it('joins multiple text blocks, generates ids and accounts usage', async () => {
    let n = 0;
    script = () => {
      n++;
      return {
        content: [
          { type: 'text', text: 'a' },
          { type: 'text', text: 'b' },
          { type: 'tool_use', name: 'finish', input: { status: 'done', reason: 'r' } },
        ],
        usage: { input_tokens: 7 * n, output_tokens: 3 * n },
      };
    };
    const provider = make();
    const out = await provider.complete(SYSTEM, TURNS, TOOLS);
    await provider.complete(SYSTEM, TURNS, TOOLS);
    expect(out.text).toBe('a\nb');
    expect(out.toolCalls[0]).toMatchObject({ name: 'finish', args: { status: 'done', reason: 'r' } });
    expect(out.toolCalls[0]?.id).toMatch(/^toolu_\d+_0$/);
    expect(provider.usage).toEqual({ inputTokens: 21, outputTokens: 9, calls: 2 });
  });

  it('handles an empty response and HTTP errors', async () => {
    script = () => ({});
    expect(await make().complete(SYSTEM, TURNS, TOOLS)).toEqual({ text: '', toolCalls: [] });
    script = () => ({ status: 500, body: { type: 'error', error: { message: 'boom' } } });
    await expect(make().complete(SYSTEM, TURNS, TOOLS)).rejects.toThrow(/LLM provider HTTP 500/);
  });
});

describe('createProvider / resolveLlmOptions', () => {
  it('picks the adapter by provider name', () => {
    expect(
      createProvider({ provider: 'anthropic', model: 'm', baseUrl: 'http://x' }),
    ).toBeInstanceOf(AnthropicProvider);
    expect(createProvider({ provider: 'openai', model: 'm', baseUrl: 'http://x' })).toBeInstanceOf(
      OpenAiCompatibleProvider,
    );
    expect(createProvider({ provider: 'openai', model: 'gpt-x', baseUrl: 'http://x' }).model).toBe(
      'gpt-x',
    );
  });

  it('keeps explicit options and strips trailing slashes from baseUrl', () => {
    const o = resolveLlmOptions({
      provider: 'anthropic',
      model: 'claude-x',
      apiKey: 'k',
      baseUrl: 'http://localhost:1234///',
      maxSteps: 4,
    });
    expect(o).toEqual({
      provider: 'anthropic',
      model: 'claude-x',
      apiKey: 'k',
      baseUrl: 'http://localhost:1234',
      maxSteps: 4,
    });
  });

  it('falls back to environment variables and provider defaults', () => {
    vi.stubEnv('AWC_LLM_PROVIDER', '');
    vi.stubEnv('AWC_LLM_MODEL', '');
    vi.stubEnv('AWC_LLM_API_KEY', '');
    vi.stubEnv('AWC_LLM_BASE_URL', '');
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    // empty strings are falsy for the ?? chains only when undefined, so delete them outright
    for (const k of [
      'AWC_LLM_PROVIDER',
      'AWC_LLM_MODEL',
      'AWC_LLM_API_KEY',
      'AWC_LLM_BASE_URL',
      'OPENAI_API_KEY',
      'ANTHROPIC_API_KEY',
    ])
      delete process.env[k];

    const openai = resolveLlmOptions({});
    expect(openai.provider).toBe('openai');
    expect(openai.baseUrl).toBe('https://api.openai.com/v1');
    expect(openai.model).toBeTruthy();
    expect(openai.apiKey).toBeUndefined();

    process.env.ANTHROPIC_API_KEY = 'ant';
    const anthropic = resolveLlmOptions({});
    expect(anthropic.provider).toBe('anthropic');
    expect(anthropic.apiKey).toBe('ant');
    expect(anthropic.baseUrl).toBe('https://api.anthropic.com');

    process.env.OPENAI_API_KEY = 'oai';
    expect(resolveLlmOptions({}).provider).toBe('openai');
    expect(resolveLlmOptions({}).apiKey).toBe('oai');

    process.env.AWC_LLM_PROVIDER = 'anthropic';
    process.env.AWC_LLM_MODEL = 'env-model';
    process.env.AWC_LLM_API_KEY = 'env-key';
    process.env.AWC_LLM_BASE_URL = 'http://proxy.local/';
    expect(resolveLlmOptions({})).toEqual({
      provider: 'anthropic',
      model: 'env-model',
      apiKey: 'env-key',
      baseUrl: 'http://proxy.local',
      maxSteps: undefined,
    });
    expect(resolveLlmOptions({ model: 'explicit' }).model).toBe('explicit');
  });
});
