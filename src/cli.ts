#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { Command } from 'commander';
import pc from 'picocolors';
import { renderBadgeSvg } from './report/badge.js';
import { renderHtml } from './report/html.js';
import { renderMarkdownSummary } from './report/markdown.js';
import { renderTerminal } from './report/terminal.js';
import { scan } from './scanner.js';
import { resolveTasks } from './tasks/archetypes.js';
import type { ScanOptions, ScanResult } from './types.js';
import { toolVersion } from './util/version.js';

const program = new Command();
program
  .name('agentic-web-check')
  .description('Lighthouse for AI agents: measure whether a website is usable by AI agents.')
  .version(toolVersion());

interface CommonFlags {
  pages?: string;
  timeout?: string;
  tasks?: string;
  agent?: 'baseline' | 'llm';
  provider?: 'openai' | 'anthropic';
  model?: string;
  maxSteps?: string;
  allowForms?: boolean;
  allowConsequential?: boolean;
  json?: string;
  html?: string;
  md?: string;
  badge?: string;
  out?: string;
  browserPath?: string;
  headed?: boolean;
  quiet?: boolean;
  verbose?: boolean;
  color?: boolean;
  failUnder?: string;
  failOnTaskFail?: boolean;
  failOn?: string;
  only?: string;
}

function addCommonFlags(cmd: Command): Command {
  return cmd
    .option(
      '-p, --pages <n>',
      'number of same-origin pages to scan (start page + linked pages)',
      '3',
    )
    .option('-t, --timeout <ms>', 'navigation timeout in milliseconds', '30000')
    .option('--tasks <spec>', '"default" for built-in archetypes or a path to a tasks YAML file')
    .option('--agent <kind>', 'task agent: baseline (no LLM) or llm', 'baseline')
    .option(
      '--provider <name>',
      'LLM provider: openai (any OpenAI-compatible endpoint) or anthropic',
    )
    .option('--model <id>', 'LLM model id (or AWC_LLM_MODEL)')
    .option('--max-steps <n>', 'maximum agent steps per task')
    .option(
      '--allow-forms',
      'allow tasks with safety: form-submit to submit POST forms (synthetic data only)',
    )
    .option(
      '--allow-consequential',
      'allow tasks with safety: consequential to perform consequential actions (use only on sites you own)',
    )
    .option('--json <file>', 'write JSON results')
    .option('--html <file>', 'write a static HTML report')
    .option('--md <file>', 'write a markdown summary')
    .option('--badge <file>', 'write an SVG badge')
    .option(
      '-o, --out <dir>',
      'output directory for all artifacts (results.json, report.html, summary.md, badge.svg, screenshots/)',
    )
    .option('--browser-path <path>', 'path to a Chromium/Chrome executable (or AWC_BROWSER_PATH)')
    .option('--headed', 'run the browser with a visible window')
    .option('--only <ids>', 'comma-separated check ids to run (debug)')
    .option('-q, --quiet', 'no progress output')
    .option('-v, --verbose', 'show passed checks, evidence and task steps')
    .option('--no-color', 'disable colours');
}

async function execute(url: string, flags: CommonFlags, ciMode: boolean): Promise<void> {
  const log = flags.quiet ? () => {} : (m: string) => process.stderr.write(pc.dim(`› ${m}\n`));
  const tasks = resolveTasks(flags.tasks);
  const out = flags.out ? resolve(flags.out) : undefined;
  const options: ScanOptions = {
    url,
    pages: Number(flags.pages ?? 3),
    timeoutMs: Number(flags.timeout ?? 30000),
    tasks,
    agent: flags.agent ?? 'baseline',
    llm: {
      provider:
        flags.provider ?? (process.env.AWC_LLM_PROVIDER as 'openai' | 'anthropic') ?? 'openai',
      model: flags.model ?? process.env.AWC_LLM_MODEL ?? '',
      maxSteps: flags.maxSteps ? Number(flags.maxSteps) : undefined,
    },
    allowForms: !!flags.allowForms,
    allowConsequential: !!flags.allowConsequential,
    outputDir: out,
    browserPath: flags.browserPath,
    headless: !flags.headed,
    onlyChecks: flags.only ? flags.only.split(',').map((s) => s.trim()) : undefined,
    log,
  };
  if (options.llm && !options.llm.model)
    options.llm = { ...options.llm, model: undefined as unknown as string };
  const result = await scan(options);
  writeArtifacts(result, flags, out);
  process.stdout.write(
    `${renderTerminal(result, { color: flags.color !== false, verbose: !!flags.verbose })}\n`,
  );
  if (ciMode || flags.failUnder || flags.failOnTaskFail || flags.failOn)
    process.exitCode = evaluateThresholds(result, flags);
}

export function evaluateThresholds(result: ScanResult, flags: CommonFlags): number {
  const problems: string[] = [];
  if (flags.failUnder !== undefined) {
    const min = Number(flags.failUnder);
    if (result.overall === null || result.overall < min)
      problems.push(`overall score ${result.overall ?? 'n/a'} is below ${min}`);
  }
  if (flags.failOnTaskFail) {
    const bad = result.tasks.filter((t) => t.verdict === 'FAIL' || t.verdict === 'BLOCKED');
    if (bad.length)
      problems.push(
        `${bad.length} behavioural tasks did not pass (${bad.map((t) => `${t.name}: ${t.verdict}`).join(', ')})`,
      );
  }
  if (flags.failOn) {
    const ids = flags.failOn.split(',').map((s) => s.trim());
    const bad = result.checks.filter(
      (c) =>
        ids.includes(c.id) &&
        (c.status === 'fail' || (ids.includes(`${c.id}:warn`) && c.status === 'warn')),
    );
    if (bad.length) problems.push(`checks failed: ${bad.map((c) => c.id).join(', ')}`);
  }
  if (problems.length) {
    process.stdout.write(
      `\n${pc.red(pc.bold('CI threshold not met'))}\n${problems.map((p) => `  - ${p}`).join('\n')}\n`,
    );
    return 1;
  }
  return 0;
}

function writeArtifacts(result: ScanResult, flags: CommonFlags, out?: string): void {
  const write = (file: string | undefined, content: string) => {
    if (!file) return;
    mkdirSync(dirname(resolve(file)), { recursive: true });
    writeFileSync(file, content);
  };
  const json = JSON.stringify(result, null, 2);
  write(flags.json ?? (out ? join(out, 'results.json') : undefined), json);
  write(flags.html ?? (out ? join(out, 'report.html') : undefined), renderHtml(result));
  write(flags.md ?? (out ? join(out, 'summary.md') : undefined), renderMarkdownSummary(result));
  write(flags.badge ?? (out ? join(out, 'badge.svg') : undefined), renderBadgeSvg(result));
}

addCommonFlags(
  program
    .command('scan')
    .description('deterministic scan, plus behavioural tasks when --tasks is given')
    .argument('<url>'),
)
  .option('--fail-under <score>', 'exit 1 when the overall score is below this value')
  .option('--fail-on-task-fail', 'exit 1 when any behavioural task is FAIL or BLOCKED')
  .option(
    '--fail-on <ids>',
    'exit 1 when any of these check ids fail (append :warn to include warnings)',
  )
  .action((url: string, flags: CommonFlags) => run(() => execute(url, flags, false)));

addCommonFlags(
  program
    .command('test')
    .description('behavioural tasks only (deterministic checks still run, scored separately)')
    .argument('<url>'),
)
  .option('--fail-on-task-fail', 'exit 1 when any behavioural task is FAIL or BLOCKED')
  .action((url: string, flags: CommonFlags) =>
    run(() => execute(url, { ...flags, tasks: flags.tasks ?? 'default' }, false)),
  );

addCommonFlags(
  program
    .command('ci')
    .description(
      'scan with CI defaults: thresholds enforced, artifacts written to --out (default ./awc-results)',
    )
    .argument('<url>'),
)
  .option('--fail-under <score>', 'minimum overall score', '0')
  .option('--fail-on-task-fail', 'exit 1 when any behavioural task is FAIL or BLOCKED')
  .option('--fail-on <ids>', 'exit 1 when any of these check ids fail')
  .action((url: string, flags: CommonFlags) =>
    run(() =>
      execute(
        url,
        { ...flags, out: flags.out ?? 'awc-results', quiet: flags.quiet ?? false },
        true,
      ),
    ),
  );

program
  .command('report')
  .description('re-render a results.json file as terminal output, HTML, markdown or badge')
  .argument('<results.json>')
  .option('--html <file>')
  .option('--md <file>')
  .option('--badge <file>')
  .option('-v, --verbose')
  .option('--no-color')
  .action((file: string, flags: CommonFlags) =>
    run(async () => {
      const result = JSON.parse(readFileSync(file, 'utf8')) as ScanResult;
      writeArtifacts(result, flags);
      process.stdout.write(
        `${renderTerminal(result, { color: flags.color !== false, verbose: !!flags.verbose })}\n`,
      );
    }),
  );

program
  .command('checks')
  .description('list all checks with dimension, weight and rationale')
  .action(async () => {
    const { ALL_CHECKS } = await import('./checks/index.js');
    for (const c of ALL_CHECKS)
      process.stdout.write(
        `${c.id.padEnd(34)} ${c.dimension.padEnd(19)} w${String(c.weight).padStart(2)}  ${c.title}\n`,
      );
  });

function run(fn: () => Promise<void>): void {
  fn().catch((e: unknown) => {
    process.stderr.write(`${pc.red('error:')} ${String((e as Error).message ?? e)}\n`);
    process.exitCode = 2;
  });
}

program.parseAsync(process.argv);
