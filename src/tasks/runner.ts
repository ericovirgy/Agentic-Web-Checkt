import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { BrowserSession } from '../browser/session.js';
import type { ScanOptions, TaskDefinition, TaskResult, TaskVerdict } from '../types.js';
import { capturePageState, evaluateAll } from './assertions.js';
import { type AgentOutcome, runBaselineAgent } from './baseline.js';
import { runLlmAgent } from './llm-agent.js';
import { createProvider, resolveLlmOptions } from './llm-provider.js';
import { BrowserTools } from './tools.js';

export interface RunTasksOptions extends ScanOptions {
  timeoutMs: number;
  version: string;
  log: (m: string) => void;
}

export async function runTasks(
  session: BrowserSession,
  tasks: TaskDefinition[],
  opts: RunTasksOptions,
): Promise<TaskResult[]> {
  const results: TaskResult[] = [];
  const agentKind = opts.agent ?? 'baseline';
  const provider = agentKind === 'llm' ? createProvider(resolveLlmOptions(opts.llm ?? {})) : null;
  for (const task of tasks) {
    results.push(await runTask(session, task, opts, agentKind, provider));
  }
  return results;
}

async function runTask(
  session: BrowserSession,
  task: TaskDefinition,
  opts: RunTasksOptions,
  agentKind: 'baseline' | 'llm',
  provider: ReturnType<typeof createProvider> | null,
): Promise<TaskResult> {
  const started = Date.now();
  const startUrl = task.start ? new URL(task.start, opts.url).toString() : opts.url;
  const safety = task.safety ?? 'read-only';
  const page = await session.newPage();
  const consoleErrors: string[] = [];
  page.on(
    'pageerror',
    (e) => consoleErrors.length < 20 && consoleErrors.push(String(e.message).slice(0, 200)),
  );
  const screenshots: { label: string; path: string }[] = [];
  const shotDir = opts.outputDir ? join(opts.outputDir, 'screenshots') : null;
  if (shotDir && opts.screenshots !== false) mkdirSync(shotDir, { recursive: true });
  const shoot = async (label: string) => {
    if (!shotDir || opts.screenshots === false) return;
    const file = join(shotDir, `${task.name.replace(/[^a-z0-9-]/gi, '_')}-${label}.png`);
    try {
      await page.screenshot({ path: file, fullPage: false });
      screenshots.push({ label, path: file });
    } catch {}
  };

  const tools = new BrowserTools(page, {
    safety,
    allowForms: !!opts.allowForms,
    allowConsequential: !!opts.allowConsequential,
    origin: new URL(opts.url).origin,
  });
  const base: Omit<
    TaskResult,
    'verdict' | 'reason' | 'finalUrl' | 'finalTitle' | 'assertions' | 'durationMs'
  > = {
    name: task.name,
    goal: task.goal,
    agent: agentKind,
    model: provider?.model,
    safety,
    startUrl,
    steps: tools.steps,
    screenshots,
    consoleErrors,
  };
  let outcome: AgentOutcome;
  let error: string | undefined;
  try {
    const resp = await page.goto(startUrl, { waitUntil: 'load', timeout: opts.timeoutMs });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    await shoot('start');
    if (resp && resp.status() >= 400) {
      outcome = { status: 'blocked', reason: `HTTP ${resp.status()} on start URL` };
      const r = finish(base, 'BLOCKED', outcome.reason, page, [], started, outcome, 'http-error');
      await shoot('end');
      await page.close().catch(() => {});
      return await r;
    }
    const runOpts = {
      maxSteps: task.max_steps ?? (agentKind === 'llm' ? (opts.llm?.maxSteps ?? 15) : 15),
      deadlineMs: Math.max(60_000, opts.timeoutMs * 4),
      log: opts.log,
    };
    outcome = provider
      ? await runLlmAgent(tools, task, provider, runOpts)
      : await runBaselineAgent(tools, task, runOpts);
  } catch (e) {
    error = String((e as Error).message ?? e).split('\n')[0];
    outcome = { status: 'error', reason: error ?? 'error' };
  }
  await shoot(outcome.status === 'done' ? 'end' : 'failure');

  let verdict: TaskVerdict;
  let reason: string;
  let assertions: TaskResult['assertions'] = [];
  const state = await capturePageState(page).catch(() => null);
  if (state && outcome.status !== 'error')
    assertions = evaluateAll(task.success, state, outcome.answer);
  const allHold = assertions.length > 0 && assertions.every((a) => a.holds);
  if (outcome.status === 'error') {
    verdict = 'INCONCLUSIVE';
    reason = `runner error: ${outcome.reason}`;
  } else if (outcome.status === 'blocked') {
    verdict = 'BLOCKED';
    reason = outcome.reason;
  } else if (outcome.status === 'done') {
    verdict = allHold ? 'PASS' : 'FAIL';
    reason = allHold
      ? outcome.reason
      : `agent reported done but ${assertions.filter((a) => !a.holds).length} success criteria do not hold`;
  } else {
    verdict = allHold ? 'FAIL' : 'FAIL';
    reason = allHold
      ? `success criteria hold on the final page but the agent gave up: ${outcome.reason}`
      : outcome.reason;
  }
  const usage = provider ? { ...provider.usage } : undefined;
  const result = await finish(
    { ...base, usage, error },
    verdict,
    reason,
    page,
    assertions,
    started,
    outcome,
    outcome.blocker?.kind,
  );
  await page.close().catch(() => {});
  opts.log(`task ${task.name}: ${verdict} (${tools.steps.length} steps) ${reason}`);
  return result;
}

async function finish(
  base: Omit<
    TaskResult,
    'verdict' | 'reason' | 'finalUrl' | 'finalTitle' | 'assertions' | 'durationMs'
  >,
  verdict: TaskVerdict,
  reason: string,
  page: { url(): string; title(): Promise<string> },
  assertions: TaskResult['assertions'],
  started: number,
  outcome: AgentOutcome,
  blocker?: TaskResult['blocker'],
): Promise<TaskResult> {
  return {
    ...base,
    verdict,
    reason,
    finalUrl: page.url(),
    finalTitle: await page.title().catch(() => ''),
    assertions,
    answer: outcome.answer,
    blocker: verdict === 'BLOCKED' ? (blocker ?? 'bot-wall') : undefined,
    durationMs: Date.now() - started,
  };
}
