/**
 * Minimal provider adapters over fetch. Two wire formats cover the ecosystem:
 *  - OpenAI-compatible chat/completions (OpenAI, Ollama, OpenRouter, Groq, Gemini compat, vLLM, LM Studio)
 *  - Anthropic Messages API
 * Tool definitions are plain JSON Schema so the loop is provider-agnostic.
 */
import type { LlmOptions } from '../types.js';
import { redactSecrets } from '../util/text.js';

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface Turn {
  role: 'user' | 'assistant' | 'tool';
  text?: string;
  toolCalls?: ToolCall[];
  toolResults?: { id: string; name: string; result: string }[];
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  calls: number;
}

export interface LlmProvider {
  readonly model: string;
  readonly usage: Usage;
  complete(
    system: string,
    turns: Turn[],
    tools: ToolDef[],
    forceTool?: string,
  ): Promise<{ text: string; toolCalls: ToolCall[] }>;
}

export function resolveLlmOptions(
  partial: Partial<LlmOptions> & { provider?: string },
): LlmOptions {
  const provider = (partial.provider ??
    process.env.AWC_LLM_PROVIDER ??
    (process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY ? 'anthropic' : 'openai')) as
    | 'openai'
    | 'anthropic';
  const model =
    partial.model ??
    process.env.AWC_LLM_MODEL ??
    (provider === 'anthropic' ? 'claude-sonnet-5-5' : 'gpt-4.1-mini');
  const apiKey =
    partial.apiKey ??
    process.env.AWC_LLM_API_KEY ??
    (provider === 'anthropic' ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY);
  const baseUrl = (
    partial.baseUrl ??
    process.env.AWC_LLM_BASE_URL ??
    (provider === 'anthropic' ? 'https://api.anthropic.com' : 'https://api.openai.com/v1')
  ).replace(/\/+$/, '');
  return { provider, model, apiKey, baseUrl, maxSteps: partial.maxSteps };
}

export function createProvider(opts: LlmOptions): LlmProvider {
  return opts.provider === 'anthropic'
    ? new AnthropicProvider(opts)
    : new OpenAiCompatibleProvider(opts);
}

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok)
    throw new Error(`LLM provider HTTP ${res.status}: ${redactSecrets(text.slice(0, 160))}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`LLM provider returned non-JSON: ${text.slice(0, 200)}`);
  }
}

function safeParse(s: unknown): Record<string, unknown> {
  if (s && typeof s === 'object') return s as Record<string, unknown>;
  try {
    return JSON.parse(String(s ?? '{}')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export class OpenAiCompatibleProvider implements LlmProvider {
  readonly model: string;
  readonly usage: Usage = { inputTokens: 0, outputTokens: 0, calls: 0 };
  constructor(private opts: LlmOptions) {
    this.model = opts.model;
  }
  async complete(system: string, turns: Turn[], tools: ToolDef[], forceTool?: string) {
    const messages: unknown[] = [{ role: 'system', content: system }];
    for (const t of turns) {
      if (t.role === 'user') messages.push({ role: 'user', content: t.text ?? '' });
      else if (t.role === 'assistant')
        messages.push({
          role: 'assistant',
          content: t.text ?? null,
          tool_calls: t.toolCalls?.map((c) => ({
            id: c.id,
            type: 'function',
            function: { name: c.name, arguments: JSON.stringify(c.args) },
          })),
        });
      else
        for (const r of t.toolResults ?? [])
          messages.push({ role: 'tool', tool_call_id: r.id, content: r.result });
    }
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      tools: tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      })),
      temperature: 0,
    };
    if (forceTool) body.tool_choice = { type: 'function', function: { name: forceTool } };
    const headers: Record<string, string> = {};
    if (this.opts.apiKey) headers.authorization = `Bearer ${this.opts.apiKey}`;
    const json = (await postJson(`${this.opts.baseUrl}/chat/completions`, headers, body)) as {
      choices?: {
        message?: {
          content?: string | null;
          tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[];
        };
      }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    this.usage.calls++;
    this.usage.inputTokens += json.usage?.prompt_tokens ?? 0;
    this.usage.outputTokens += json.usage?.completion_tokens ?? 0;
    const msg = json.choices?.[0]?.message ?? {};
    const toolCalls: ToolCall[] = (msg.tool_calls ?? []).map((c, i) => ({
      id: c.id ?? `call_${Date.now()}_${i}`,
      name: c.function?.name ?? '',
      args: safeParse(c.function?.arguments),
    }));
    return { text: msg.content ?? '', toolCalls };
  }
}

export class AnthropicProvider implements LlmProvider {
  readonly model: string;
  readonly usage: Usage = { inputTokens: 0, outputTokens: 0, calls: 0 };
  constructor(private opts: LlmOptions) {
    this.model = opts.model;
  }
  async complete(system: string, turns: Turn[], tools: ToolDef[], _forceTool?: string) {
    const messages: unknown[] = [];
    for (const t of turns) {
      if (t.role === 'user') messages.push({ role: 'user', content: t.text ?? '' });
      else if (t.role === 'assistant') {
        const content: unknown[] = [];
        if (t.text) content.push({ type: 'text', text: t.text });
        for (const c of t.toolCalls ?? [])
          content.push({ type: 'tool_use', id: c.id, name: c.name, input: c.args });
        messages.push({ role: 'assistant', content });
      } else
        messages.push({
          role: 'user',
          content: (t.toolResults ?? []).map((r) => ({
            type: 'tool_result',
            tool_use_id: r.id,
            content: r.result,
          })),
        });
    }
    const body = {
      model: this.model,
      max_tokens: 1024,
      system,
      messages,
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      })),
      temperature: 0,
    };
    const headers: Record<string, string> = { 'anthropic-version': '2023-06-01' };
    if (this.opts.apiKey) headers['x-api-key'] = this.opts.apiKey;
    const json = (await postJson(`${this.opts.baseUrl}/v1/messages`, headers, body)) as {
      content?: {
        type: string;
        text?: string;
        id?: string;
        name?: string;
        input?: Record<string, unknown>;
      }[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    this.usage.calls++;
    this.usage.inputTokens += json.usage?.input_tokens ?? 0;
    this.usage.outputTokens += json.usage?.output_tokens ?? 0;
    const text = (json.content ?? [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('\n');
    const toolCalls: ToolCall[] = (json.content ?? [])
      .filter((b) => b.type === 'tool_use')
      .map((b, i) => ({
        id: b.id ?? `toolu_${Date.now()}_${i}`,
        name: b.name ?? '',
        args: b.input ?? {},
      }));
    return { text, toolCalls };
  }
}
