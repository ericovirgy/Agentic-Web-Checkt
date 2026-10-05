import { truncateSnapshot } from '../browser/snapshot.js';

/**
 * The LLM-facing snapshot omits iframe subtrees. Cross-origin frames (including internal hosts the
 * scanner can reach) would otherwise be readable by a prompt-injected model and exfiltrated through
 * a same-origin navigation. The deterministic checks still inspect frames.
 */
export function omitFrameContent(snapshotText: string): string {
  const lines = snapshotText.split('\n');
  const out: string[] = [];
  let skipIndent = -1;
  for (const line of lines) {
    const indent = line.length - line.trimStart().length;
    if (skipIndent >= 0) {
      if (indent > skipIndent) continue;
      skipIndent = -1;
    }
    if (/^\s*- iframe\b/.test(line)) {
      out.push(`${line.replace(/:\s*$/, '')} [content omitted for the agent]`);
      skipIndent = indent;
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

function forAgent(text: string): string {
  return truncateSnapshot(omitFrameContent(text), SNAPSHOT_CHARS_FOR_AGENT);
}

import type { TaskDefinition } from '../types.js';
import type { AgentOutcome, AgentRunOptions } from './baseline.js';
import type { LlmProvider, ToolDef, Turn } from './llm-provider.js';
import { BlockedError, type BrowserTools, SNAPSHOT_CHARS_FOR_AGENT } from './tools.js';

const TOOLS: ToolDef[] = [
  {
    name: 'snapshot',
    description:
      'Take a fresh accessibility snapshot of the current page. Elements carry [ref=eN] identifiers used by other tools.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'click',
    description: 'Click an element by its ref.',
    parameters: {
      type: 'object',
      properties: { ref: { type: 'string', description: 'ref from the snapshot, e.g. e12' } },
      required: ['ref'],
      additionalProperties: false,
    },
  },
  {
    name: 'type',
    description: 'Type text into a textbox/searchbox by ref; optionally press Enter afterwards.',
    parameters: {
      type: 'object',
      properties: {
        ref: { type: 'string' },
        text: { type: 'string' },
        submit: { type: 'boolean', description: 'press Enter after typing' },
      },
      required: ['ref', 'text'],
      additionalProperties: false,
    },
  },
  {
    name: 'select',
    description: 'Choose an option in a combobox/select by visible label.',
    parameters: {
      type: 'object',
      properties: { ref: { type: 'string' }, value: { type: 'string' } },
      required: ['ref', 'value'],
      additionalProperties: false,
    },
  },
  {
    name: 'press',
    description: 'Press a keyboard key (Enter, Escape, Tab, ArrowDown…).',
    parameters: {
      type: 'object',
      properties: { key: { type: 'string' } },
      required: ['key'],
      additionalProperties: false,
    },
  },
  {
    name: 'navigate',
    description: 'Go to a URL on the same site.',
    parameters: {
      type: 'object',
      properties: { url: { type: 'string' } },
      required: ['url'],
      additionalProperties: false,
    },
  },
  {
    name: 'scroll',
    description: 'Scroll the page.',
    parameters: {
      type: 'object',
      properties: { direction: { type: 'string', enum: ['down', 'up'] } },
      required: ['direction'],
      additionalProperties: false,
    },
  },
  {
    name: 'back',
    description: 'Go back to the previous page.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'finish',
    description:
      'End the task. Use status "done" only when the goal is visibly achieved on the current page; "gave_up" when it cannot be achieved; "blocked" when a login, CAPTCHA, bot wall or a consequential action you must not perform stands in the way.',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['done', 'gave_up', 'blocked'] },
        reason: { type: 'string' },
        answer: {
          type: 'string',
          description: 'The information the task asked for, if any (verbatim from the page).',
        },
      },
      required: ['status', 'reason'],
      additionalProperties: false,
    },
  },
];

function systemPrompt(task: TaskDefinition, origin: string): string {
  return [
    'You are a careful web agent being used to evaluate whether a website is usable by AI agents.',
    `You operate a browser on ${origin} through tools. You see pages as accessibility snapshots with [ref=eN] identifiers.`,
    'Rules:',
    '- Work only on this website. Do not invent information: answers must come verbatim from page text.',
    `- Safety level: ${task.safety ?? 'read-only'}. Never perform purchases, deletions, sending, transfers or account changes unless the task explicitly allows it; if such a step is required, finish with status "blocked".`,
    '- Do not fill forms with real personal data; use the synthetic data provided in the task, if any.',
    '- After every action you receive a fresh snapshot. If an action produced no visible change, try a different element.',
    '- Be economical: do not take more than one snapshot in a row; prefer clicking named links over guessing URLs.',
    '- When the goal is achieved, call finish with status "done" and include the answer when the task asks for information.',
  ].join('\n');
}

export async function runLlmAgent(
  tools: BrowserTools,
  task: TaskDefinition,
  provider: LlmProvider,
  opts: AgentRunOptions,
): Promise<AgentOutcome> {
  const origin = new URL(tools.page.url()).origin;
  const system = systemPrompt(task, origin);
  const turns: Turn[] = [];
  const initial = await tools.takeSnapshot();
  const dataNote = task.data ? `\nSynthetic data you may use: ${JSON.stringify(task.data)}` : '';
  turns.push({
    role: 'user',
    text: `Task: ${task.goal}${dataNote}\n\nCurrent URL: ${tools.page.url()}\nSnapshot:\n${forAgent(initial.text)}`,
  });
  const started = Date.now();

  for (let step = 0; step < opts.maxSteps; step++) {
    if (Date.now() - started > opts.deadlineMs)
      return { status: 'gave_up', reason: 'wall-clock budget exhausted' };
    const blocker = await tools.detectBlocker();
    if (blocker)
      return {
        status: 'blocked',
        reason: `${blocker.kind}: ${blocker.detail}`,
        blocker: new BlockedError(blocker.kind, blocker.detail),
      };
    const last = step === opts.maxSteps - 1;
    if (last)
      turns.push({ role: 'user', text: 'This is your final step. You must call finish now.' });
    const { text, toolCalls } = await provider.complete(
      system,
      turns,
      last ? TOOLS.filter((t) => t.name === 'finish') : TOOLS,
      last ? 'finish' : undefined,
    );
    if (toolCalls.length === 0) {
      turns.push({ role: 'assistant', text });
      turns.push({ role: 'user', text: 'Use a tool. Call finish if you are done or stuck.' });
      continue;
    }
    turns.push({ role: 'assistant', text, toolCalls });
    const results: { id: string; name: string; result: string }[] = [];
    // Parallel tool calls count against the step budget individually.
    const remaining = opts.maxSteps - step - 1;
    for (const call of toolCalls.slice(0, Math.max(1, remaining + 1))) {
      if (call !== toolCalls[0]) step++;
      const a = call.args;
      try {
        let r: string;
        switch (call.name) {
          case 'snapshot':
            r = forAgent(await tools.snapshotText());
            break;
          case 'click':
            r = await tools.click(String(a.ref ?? ''));
            break;
          case 'type':
            r = await tools.type(String(a.ref ?? ''), String(a.text ?? ''), Boolean(a.submit));
            break;
          case 'select':
            r = await tools.select(String(a.ref ?? ''), String(a.value ?? ''));
            break;
          case 'press':
            r = await tools.press(String(a.key ?? 'Enter'));
            break;
          case 'navigate':
            r = await tools.navigate(String(a.url ?? ''));
            break;
          case 'scroll':
            r = await tools.scroll(a.direction === 'up' ? 'up' : 'down');
            break;
          case 'back':
            r = await tools.back();
            break;
          case 'finish': {
            const status = String(a.status ?? 'gave_up');
            const reason = String(a.reason ?? '');
            const answer = a.answer !== undefined ? String(a.answer) : undefined;
            tools.recordFinish(status, reason, answer);
            if (status === 'done') return { status: 'done', reason, answer };
            if (status === 'blocked') return { status: 'blocked', reason, answer };
            return { status: 'gave_up', reason, answer };
          }
          default:
            r = `unknown tool ${call.name}`;
        }
        const snapText =
          call.name === 'snapshot'
            ? ''
            : `\nURL: ${tools.page.url()}\nSnapshot:\n${forAgent(tools.currentSnapshot?.text ?? '')}`;
        results.push({ id: call.id, name: call.name, result: `${r}${snapText}` });
      } catch (e) {
        if (e instanceof BlockedError) return { status: 'blocked', reason: e.message, blocker: e };
        results.push({
          id: call.id,
          name: call.name,
          result: `Error: ${String((e as Error).message).split('\n')[0]}`,
        });
      }
    }
    turns.push({ role: 'tool', toolResults: results });
  }
  return { status: 'gave_up', reason: `step budget (${opts.maxSteps}) exhausted without finish` };
}
