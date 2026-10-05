#!/usr/bin/env node
/**
 * Reproducible benchmark harness.
 *
 * Runs `scan()` over every entry of a dataset (local fixture sites or public URLs) N times and
 * writes raw per-run results, an aggregate, a markdown summary and a manifest to an output
 * directory. See benchmark/README.md for the methodology and the publishing rules.
 *
 *   npx tsx benchmark/run.ts --dataset benchmark/datasets/dev-fixtures.json [--agent baseline|llm]
 *     [--runs N] [--out DIR] [--only id1,id2] [--pages 3] [--browser-path PATH]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { startFixtureServer } from '../fixtures/server.js';
import {
  type AgentKind,
  type CheckStatus,
  DEFAULT_TASKS,
  DIMENSION_LABELS,
  DIMENSIONS,
  type Dimension,
  loadTasksFile,
  METHODOLOGY_VERSION,
  parseTaskDefinition,
  RESULT_SCHEMA_VERSION,
  type ScanResult,
  scan,
  type TaskDefinition,
  type TaskVerdict,
} from '../src/index.js';
import { toolVersion } from '../src/util/version.js';

/** Bumped when the aggregate/summary/manifest layout or the aggregation rules change. */
export const HARNESS_VERSION = '1';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE_SITES = join(REPO_ROOT, 'fixtures', 'sites');
const VERDICTS: TaskVerdict[] = ['PASS', 'FAIL', 'BLOCKED', 'INCONCLUSIVE'];

// ---- Dataset ----------------------------------------------------------------

export interface DatasetEntry {
  id: string;
  category: string;
  /** Name of a directory under fixtures/sites; served locally for the scan. */
  fixture?: string;
  /** Absolute URL of a real site (used when `fixture` is absent). */
  url?: string;
  /** "fixture" (tasks from fixture.json), "default" (built-in archetypes), "none", a YAML path or an inline list. */
  tasks?: 'fixture' | 'default' | 'none' | string | unknown[];
  notes?: string;
}

export interface Dataset {
  name: string;
  version: string;
  description: string;
  entries: DatasetEntry[];
}

interface FixtureFile {
  expect?: Record<string, CheckStatus>;
  tasks?: ({ name: string; expect?: TaskVerdict } & Record<string, unknown>)[];
}

export function loadDataset(file: string): Dataset {
  const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<Dataset>;
  if (!raw || typeof raw.name !== 'string' || !Array.isArray(raw.entries))
    throw new Error(`${file}: expected { name, version, description, entries[] }`);
  const ids = new Set<string>();
  for (const e of raw.entries) {
    if (!e || typeof e.id !== 'string') throw new Error(`${file}: every entry needs an id`);
    if (ids.has(e.id)) throw new Error(`${file}: duplicate entry id "${e.id}"`);
    ids.add(e.id);
    if (!e.fixture && !e.url) throw new Error(`${file}: entry "${e.id}" needs fixture or url`);
    if (e.fixture && !existsSync(join(FIXTURE_SITES, e.fixture, 'fixture.json')))
      throw new Error(`${file}: entry "${e.id}" refers to unknown fixture "${e.fixture}"`);
  }
  return {
    name: raw.name,
    version: String(raw.version ?? '0'),
    description: raw.description ?? '',
    entries: raw.entries,
  };
}

function readFixtureFile(fixture: string): FixtureFile {
  return JSON.parse(readFileSync(join(FIXTURE_SITES, fixture, 'fixture.json'), 'utf8'));
}

function resolveEntryTasks(entry: DatasetEntry, datasetDir: string): TaskDefinition[] {
  const spec = entry.tasks ?? 'none';
  if (Array.isArray(spec))
    return spec.map((t, i) => parseTaskDefinition(t, `${entry.id}.tasks[${i}]`));
  if (spec === 'none') return [];
  if (spec === 'default') return DEFAULT_TASKS;
  if (spec === 'fixture') {
    if (!entry.fixture) throw new Error(`entry "${entry.id}": tasks "fixture" needs a fixture`);
    const tasks = readFixtureFile(entry.fixture).tasks ?? [];
    return tasks.map((t, i) => parseTaskDefinition(t, `${entry.fixture}/fixture.json tasks[${i}]`));
  }
  return loadTasksFile(resolve(datasetDir, spec));
}

// ---- Aggregation ------------------------------------------------------------

export interface Stat {
  mean: number | null;
  min: number | null;
  max: number | null;
  n: number;
}

export function stat(values: (number | null | undefined)[]): Stat {
  const xs = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (xs.length === 0) return { mean: null, min: null, max: null, n: 0 };
  const sum = xs.reduce((a, b) => a + b, 0);
  return {
    mean: Math.round((sum / xs.length) * 10) / 10,
    min: Math.min(...xs),
    max: Math.max(...xs),
    n: xs.length,
  };
}

export type VerdictCounts = Record<TaskVerdict, number>;

function emptyVerdicts(): VerdictCounts {
  return { PASS: 0, FAIL: 0, BLOCKED: 0, INCONCLUSIVE: 0 };
}

export interface TaskAggregate extends VerdictCounts {
  /** Verdict the fixture declares (fixtures only). */
  expected: TaskVerdict | null;
  /** Distinct verdicts observed across runs. */
  observed: TaskVerdict[];
}

export interface CheckMismatch {
  id: string;
  expected: CheckStatus;
  /** Distinct statuses observed across runs ("missing" when the check did not run). */
  observed: string[];
}

export interface Expectations {
  checks: { expected: number; matched: number; mismatches: CheckMismatch[] };
  tasks: {
    expected: number;
    matched: number;
    mismatches: { name: string; expected: TaskVerdict; observed: TaskVerdict[] }[];
  };
}

export interface EntryAggregate {
  id: string;
  category: string;
  kind: 'fixture' | 'url';
  target: string;
  runs: number;
  completed: number;
  errors: { run: number; error: string }[];
  overall: Stat;
  dimensions: Record<Dimension, Stat>;
  tasks: Record<string, TaskAggregate>;
  verdicts: VerdictCounts;
  /** Share of tasks whose verdict changed across runs (null when fewer than two completed runs). */
  flakiness: number | null;
  flakyTasks: string[];
  durationMs: Stat;
  expectations: Expectations | null;
  runFiles: string[];
}

export interface DatasetTotals {
  entries: number;
  completed: number;
  failed: number;
  meanOverall: number | null;
  verdicts: VerdictCounts;
  /** 100 * PASS / (PASS + FAIL + BLOCKED), the SCORING.md task-success rule over all tasks. */
  taskSuccess: number | null;
  meanFlakiness: number | null;
  checkMismatches: number;
  taskMismatches: number;
  totalDurationMs: number;
}

export interface Aggregate {
  dataset: { name: string; version: string };
  harness: string;
  entries: EntryAggregate[];
  totals: DatasetTotals;
}

export function aggregateEntry(
  entry: DatasetEntry,
  results: (ScanResult | null)[],
  errors: { run: number; error: string }[],
  runFiles: string[],
  expectFile: FixtureFile | null,
): EntryAggregate {
  const ok = results.filter((r): r is ScanResult => r !== null);
  const dimensions = {} as Record<Dimension, Stat>;
  for (const d of DIMENSIONS)
    dimensions[d] = stat(ok.map((r) => r.dimensions.find((x) => x.dimension === d)?.score));

  const tasks: Record<string, TaskAggregate> = {};
  const verdicts = emptyVerdicts();
  for (const r of ok) {
    for (const t of r.tasks) {
      let agg = tasks[t.name];
      if (!agg) {
        agg = { ...emptyVerdicts(), expected: null, observed: [] };
        tasks[t.name] = agg;
      }
      agg[t.verdict] += 1;
      verdicts[t.verdict] += 1;
      if (!agg.observed.includes(t.verdict)) agg.observed.push(t.verdict);
    }
  }
  const flakyTasks = Object.entries(tasks)
    .filter(([, a]) => a.observed.length > 1)
    .map(([name]) => name);
  const taskNames = Object.keys(tasks);
  const flakiness =
    ok.length >= 2 && taskNames.length > 0
      ? Math.round((flakyTasks.length / taskNames.length) * 1000) / 1000
      : null;

  let expectations: Expectations | null = null;
  if (expectFile) {
    const checkMismatches: CheckMismatch[] = [];
    const expectChecks = expectFile.expect ?? {};
    for (const [id, expected] of Object.entries(expectChecks)) {
      const observed = [
        ...new Set(ok.map((r) => r.checks.find((c) => c.id === id)?.status ?? 'missing')),
      ];
      if (observed.length !== 1 || observed[0] !== expected)
        checkMismatches.push({ id, expected, observed });
    }
    const taskMismatches: Expectations['tasks']['mismatches'] = [];
    let expectedTasks = 0;
    for (const t of expectFile.tasks ?? []) {
      if (!t.expect) continue;
      expectedTasks += 1;
      const agg = tasks[t.name];
      if (agg) agg.expected = t.expect;
      const observed = agg?.observed ?? [];
      if (observed.length !== 1 || observed[0] !== t.expect)
        taskMismatches.push({ name: t.name, expected: t.expect, observed });
    }
    const expectedChecks = Object.keys(expectChecks).length;
    expectations = {
      checks: {
        expected: expectedChecks,
        matched: expectedChecks - checkMismatches.length,
        mismatches: checkMismatches,
      },
      tasks: {
        expected: expectedTasks,
        matched: expectedTasks - taskMismatches.length,
        mismatches: taskMismatches,
      },
    };
  }

  return {
    id: entry.id,
    category: entry.category,
    kind: entry.fixture ? 'fixture' : 'url',
    target: entry.fixture ?? entry.url ?? '',
    runs: results.length,
    completed: ok.length,
    errors,
    overall: stat(ok.map((r) => r.overall)),
    dimensions,
    tasks,
    verdicts,
    flakiness,
    flakyTasks,
    durationMs: stat(ok.map((r) => r.meta.durationMs)),
    expectations,
    runFiles,
  };
}

export function aggregateDataset(dataset: Dataset, entries: EntryAggregate[]): Aggregate {
  const verdicts = emptyVerdicts();
  let checkMismatches = 0;
  let taskMismatches = 0;
  let totalDurationMs = 0;
  for (const e of entries) {
    for (const v of VERDICTS) verdicts[v] += e.verdicts[v];
    checkMismatches += e.expectations?.checks.mismatches.length ?? 0;
    taskMismatches += e.expectations?.tasks.mismatches.length ?? 0;
    totalDurationMs += (e.durationMs.mean ?? 0) * e.durationMs.n;
  }
  const decided = verdicts.PASS + verdicts.FAIL + verdicts.BLOCKED;
  return {
    dataset: { name: dataset.name, version: dataset.version },
    harness: HARNESS_VERSION,
    entries,
    totals: {
      entries: entries.length,
      completed: entries.filter((e) => e.completed > 0).length,
      failed: entries.filter((e) => e.completed === 0).length,
      meanOverall: stat(entries.map((e) => e.overall.mean)).mean,
      verdicts,
      taskSuccess: decided > 0 ? Math.round((verdicts.PASS / decided) * 100) : null,
      meanFlakiness: stat(entries.map((e) => e.flakiness)).mean,
      checkMismatches,
      taskMismatches,
      totalDurationMs: Math.round(totalDurationMs),
    },
  };
}

// ---- Manifest and summary ---------------------------------------------------

export interface Manifest {
  harness: string;
  dataset: { name: string; version: string; file: string; description: string };
  tool: { name: 'agentic-web-check'; version: string; methodology: string; schema: string };
  agent: AgentKind;
  model: string | null;
  runs: number;
  pages: number;
  only: string[] | null;
  node: string;
  platform: string;
  browser: { name: string; version: string } | null;
  git: { commit: string | null; dirty: boolean | null };
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  outDir: string;
}

function gitInfo(): Manifest['git'] {
  try {
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    const status = execFileSync('git', ['status', '--porcelain'], {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    return { commit, dirty: status.length > 0 };
  } catch {
    return { commit: null, dirty: null };
  }
}

function fmtStat(s: Stat): string {
  if (s.mean === null) return 'n/a';
  if (s.n === 1 || s.min === s.max) return String(s.mean);
  return `${s.mean} (${s.min}-${s.max})`;
}

function fmtSeconds(s: Stat): string {
  return s.mean === null ? 'n/a' : `${(s.mean / 1000).toFixed(1)}s`;
}

function fmtMismatches(e: EntryAggregate): string {
  if (!e.expectations) return 'n/a (no fixture)';
  const { checks, tasks } = e.expectations;
  const parts: string[] = [];
  if (checks.mismatches.length === 0) parts.push(`checks ${checks.matched}/${checks.expected} ok`);
  else
    parts.push(
      `checks ${checks.matched}/${checks.expected}: ${checks.mismatches
        .map((m) => `${m.id} (expected ${m.expected}, got ${m.observed.join('/')})`)
        .join(', ')}`,
    );
  if (tasks.expected > 0) {
    if (tasks.mismatches.length === 0) parts.push(`tasks ${tasks.matched}/${tasks.expected} ok`);
    else
      parts.push(
        `tasks ${tasks.matched}/${tasks.expected}: ${tasks.mismatches
          .map((m) => `${m.name} (expected ${m.expected}, got ${m.observed.join('/') || 'none'})`)
          .join(', ')}`,
      );
  }
  return parts.join('; ');
}

export function renderSummary(manifest: Manifest, aggregate: Aggregate): string {
  const t = aggregate.totals;
  const lines: string[] = [];
  lines.push(`# Benchmark summary: ${manifest.dataset.name} v${manifest.dataset.version}`);
  lines.push('');
  lines.push(
    `Tool agentic-web-check ${manifest.tool.version}, methodology v${manifest.tool.methodology}, harness v${manifest.harness}, agent \`${manifest.agent}\`${manifest.model ? ` (${manifest.model})` : ''}, ${manifest.runs} run(s) per entry, ${manifest.pages} page(s) per scan.`,
  );
  lines.push(
    `Started ${manifest.startedAt}, finished ${manifest.finishedAt}. Node ${manifest.node}, ${manifest.browser ? `${manifest.browser.name} ${manifest.browser.version}` : 'browser n/a'}, git ${manifest.git.commit ? manifest.git.commit.slice(0, 12) + (manifest.git.dirty ? ' (dirty)' : '') : 'n/a'}.`,
  );
  lines.push('');
  lines.push(
    'Numbers below are only comparable with runs of the same dataset version, tool version and methodology version. See benchmark/README.md.',
  );
  lines.push('');
  lines.push('## Entries');
  lines.push('');
  lines.push(
    '| Entry | Category | Runs | Overall | PASS | FAIL | BLOCKED | INCONCLUSIVE | Flakiness | Duration | Fixture expectations |',
  );
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const e of aggregate.entries) {
    const runs = e.completed === e.runs ? String(e.runs) : `${e.completed}/${e.runs}`;
    const flak = e.flakiness === null ? 'n/a' : `${Math.round(e.flakiness * 100)}%`;
    const status = e.completed === 0 ? ` (error: ${e.errors[0]?.error ?? 'unknown'})` : '';
    lines.push(
      `| ${e.id}${status} | ${e.category} | ${runs} | ${fmtStat(e.overall)} | ${e.verdicts.PASS} | ${e.verdicts.FAIL} | ${e.verdicts.BLOCKED} | ${e.verdicts.INCONCLUSIVE} | ${flak} | ${fmtSeconds(e.durationMs)} | ${fmtMismatches(e)} |`,
    );
  }
  lines.push('');
  lines.push('## Dataset totals');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|---|---|');
  lines.push(`| Entries | ${t.entries} (${t.completed} completed, ${t.failed} failed) |`);
  lines.push(`| Mean overall (over entry means) | ${t.meanOverall ?? 'n/a'} |`);
  lines.push(
    `| Task verdicts PASS / FAIL / BLOCKED / INCONCLUSIVE | ${t.verdicts.PASS} / ${t.verdicts.FAIL} / ${t.verdicts.BLOCKED} / ${t.verdicts.INCONCLUSIVE} |`,
  );
  lines.push(
    `| Task success (PASS / decided) | ${t.taskSuccess === null ? 'n/a' : `${t.taskSuccess}%`} |`,
  );
  lines.push(
    `| Mean flakiness | ${t.meanFlakiness === null ? 'n/a (single run)' : `${Math.round(t.meanFlakiness * 100)}%`} |`,
  );
  lines.push(`| Fixture check mismatches | ${t.checkMismatches} |`);
  lines.push(`| Fixture task-verdict mismatches | ${t.taskMismatches} |`);
  lines.push(`| Total scan time | ${(t.totalDurationMs / 1000).toFixed(1)}s |`);
  lines.push('');
  lines.push('## Per entry');
  for (const e of aggregate.entries) {
    lines.push('');
    lines.push(`### ${e.id} (${e.kind}: ${e.target})`);
    lines.push('');
    if (e.errors.length > 0) {
      for (const err of e.errors) lines.push(`- run ${err.run} failed: ${err.error}`);
      lines.push('');
    }
    if (e.completed === 0) continue;
    lines.push('| Dimension | Mean | Min | Max |');
    lines.push('|---|---|---|---|');
    lines.push(
      `| OVERALL | ${e.overall.mean ?? 'n/a'} | ${e.overall.min ?? 'n/a'} | ${e.overall.max ?? 'n/a'} |`,
    );
    for (const d of DIMENSIONS) {
      const s = e.dimensions[d];
      lines.push(
        `| ${DIMENSION_LABELS[d]} | ${s.mean ?? 'n/a'} | ${s.min ?? 'n/a'} | ${s.max ?? 'n/a'} |`,
      );
    }
    const taskNames = Object.keys(e.tasks);
    if (taskNames.length > 0) {
      lines.push('');
      lines.push('| Task | PASS | FAIL | BLOCKED | INCONCLUSIVE | Expected | Flaky |');
      lines.push('|---|---|---|---|---|---|---|');
      for (const name of taskNames) {
        const a = e.tasks[name] as TaskAggregate;
        lines.push(
          `| ${name} | ${a.PASS} | ${a.FAIL} | ${a.BLOCKED} | ${a.INCONCLUSIVE} | ${a.expected ?? '-'} | ${a.observed.length > 1 ? 'yes' : 'no'} |`,
        );
      }
    }
    if (e.expectations && e.expectations.checks.mismatches.length > 0) {
      lines.push('');
      lines.push('Check expectation mismatches (fixture.json `expect` vs observed):');
      lines.push('');
      for (const m of e.expectations.checks.mismatches)
        lines.push(`- \`${m.id}\`: expected ${m.expected}, observed ${m.observed.join('/')}`);
    }
    if (e.expectations && e.expectations.tasks.mismatches.length > 0) {
      lines.push('');
      lines.push('Task verdict mismatches (fixture.json task `expect` vs observed):');
      lines.push('');
      for (const m of e.expectations.tasks.mismatches)
        lines.push(
          `- \`${m.name}\`: expected ${m.expected}, observed ${m.observed.join('/') || 'none'}`,
        );
    }
  }
  lines.push('');
  return lines.join('\n');
}

// ---- Runner -----------------------------------------------------------------

export interface RunOptions {
  datasetFile: string;
  agent: AgentKind;
  runs: number;
  outDir: string;
  only: string[] | null;
  pages: number;
  /** True when --pages was given on the command line (overrides fixture.json scanPages). */
  pagesExplicit?: boolean;
  browserPath: string | undefined;
  timeoutMs: number;
  log: (message: string) => void;
}

function timestamp(d: Date): string {
  return d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, 'Z')
    .replace('T', '-');
}

export async function runBenchmark(
  opts: RunOptions,
): Promise<{ aggregate: Aggregate; manifest: Manifest }> {
  const startedAt = new Date();
  const dataset = loadDataset(opts.datasetFile);
  const datasetDir = dirname(resolve(opts.datasetFile));
  const entries = opts.only
    ? dataset.entries.filter((e) => (opts.only as string[]).includes(e.id))
    : dataset.entries;
  if (opts.only) {
    const unknown = opts.only.filter((id) => !dataset.entries.some((e) => e.id === id));
    if (unknown.length > 0) throw new Error(`--only: unknown entry id(s): ${unknown.join(', ')}`);
  }
  mkdirSync(opts.outDir, { recursive: true });
  opts.log(
    `dataset ${dataset.name} v${dataset.version}: ${entries.length} entries x ${opts.runs} run(s), agent ${opts.agent}, out ${opts.outDir}`,
  );

  let browser: Manifest['browser'] = null;
  let model: string | null = null;
  const aggregates: EntryAggregate[] = [];

  for (const entry of entries) {
    const entryDir = join(opts.outDir, entry.id);
    mkdirSync(entryDir, { recursive: true });
    const results: (ScanResult | null)[] = [];
    const errors: { run: number; error: string }[] = [];
    const runFiles: string[] = [];
    let expectFile: FixtureFile | null = null;
    let tasks: TaskDefinition[] = [];
    try {
      tasks = resolveEntryTasks(entry, datasetDir);
      if (entry.fixture) expectFile = readFixtureFile(entry.fixture);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      opts.log(`[${entry.id}] cannot prepare entry: ${message}`);
      errors.push({ run: 0, error: message });
      aggregates.push(aggregateEntry(entry, [], errors, runFiles, expectFile));
      continue;
    }

    for (let n = 1; n <= opts.runs; n++) {
      const runStarted = new Date();
      const runFile = join(entryDir, `run-${n}.json`);
      const log = (m: string) => opts.log(`[${entry.id} run ${n}/${opts.runs}] ${m}`);
      let server: Awaited<ReturnType<typeof startFixtureServer>> | null = null;
      try {
        let url: string;
        if (entry.fixture) {
          server = await startFixtureServer(entry.fixture);
          url = server.url;
          log(`serving fixture "${entry.fixture}" at ${url}`);
        } else {
          url = entry.url as string;
        }
        // Fixture sites may declare how many pages their expectations assume (fixture.json scanPages).
        const fixturePages = entry.fixture
          ? (readFixtureFile(entry.fixture) as { scanPages?: number }).scanPages
          : undefined;
        const result = await scan({
          url,
          pages: opts.pagesExplicit ? opts.pages : (fixturePages ?? opts.pages),
          timeoutMs: opts.timeoutMs,
          tasks,
          agent: opts.agent,
          browserPath: opts.browserPath,
          outputDir: join(entryDir, `run-${n}`),
          log,
        });
        browser ??= { name: result.meta.browser.name, version: result.meta.browser.version };
        model ??= (result.meta.options.model as string | null) ?? null;
        writeFileSync(runFile, `${JSON.stringify(result, null, 2)}\n`);
        runFiles.push(runFile);
        results.push(result);
        const verdicts = result.tasks.map((t) => `${t.name}=${t.verdict}`).join(' ');
        log(
          `overall ${result.overall ?? 'n/a'} in ${(result.meta.durationMs / 1000).toFixed(1)}s${verdicts ? ` | ${verdicts}` : ''}`,
        );
      } catch (err) {
        const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
        log(`run failed: ${message.split('\n')[0]}`);
        errors.push({ run: n, error: message.split('\n')[0] ?? message });
        results.push(null);
        writeFileSync(
          runFile,
          `${JSON.stringify(
            {
              error: message,
              startedAt: runStarted.toISOString(),
              finishedAt: new Date().toISOString(),
            },
            null,
            2,
          )}\n`,
        );
        runFiles.push(runFile);
      } finally {
        if (server) await server.close().catch(() => {});
      }
    }
    aggregates.push(aggregateEntry(entry, results, errors, runFiles, expectFile));
  }

  const finishedAt = new Date();
  const aggregate = aggregateDataset(dataset, aggregates);
  const manifest: Manifest = {
    harness: HARNESS_VERSION,
    dataset: {
      name: dataset.name,
      version: dataset.version,
      file: resolve(opts.datasetFile),
      description: dataset.description,
    },
    tool: {
      name: 'agentic-web-check',
      version: toolVersion(),
      methodology: METHODOLOGY_VERSION,
      schema: RESULT_SCHEMA_VERSION,
    },
    agent: opts.agent,
    model,
    runs: opts.runs,
    pages: opts.pages,
    only: opts.only,
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    browser,
    git: gitInfo(),
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    outDir: resolve(opts.outDir),
  };
  writeFileSync(join(opts.outDir, 'aggregate.json'), `${JSON.stringify(aggregate, null, 2)}\n`);
  writeFileSync(join(opts.outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(join(opts.outDir, 'summary.md'), renderSummary(manifest, aggregate));
  opts.log(`wrote ${join(opts.outDir, 'summary.md')}`);
  return { aggregate, manifest };
}

// ---- CLI --------------------------------------------------------------------

function isMain(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return resolve(entry) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isMain()) {
  const program = new Command()
    .name('awc-bench')
    .description('Run a benchmark dataset through agentic-web-check and aggregate the results.')
    .requiredOption('--dataset <file>', 'dataset JSON (see benchmark/datasets)')
    .option('--agent <kind>', 'task agent: baseline or llm', 'baseline')
    .option('--runs <n>', 'scans per entry', '1')
    .option('--out <dir>', 'output directory (default benchmark/results/<dataset>-<timestamp>)')
    .option('--only <ids>', 'comma-separated entry ids to run')
    .option('--pages <n>', 'pages per scan (start page + linked pages)', '3')
    .option('--timeout <ms>', 'navigation timeout in milliseconds', '30000')
    .option('--browser-path <path>', 'Chromium/Chrome executable (or AWC_BROWSER_PATH)')
    .option('-q, --quiet', 'no progress output')
    .parse(process.argv);
  const flags = program.opts<{
    dataset: string;
    agent: string;
    runs: string;
    out?: string;
    only?: string;
    pages: string;
    timeout: string;
    browserPath?: string;
    quiet?: boolean;
  }>();
  if (flags.agent !== 'baseline' && flags.agent !== 'llm') {
    console.error(`--agent must be baseline or llm (got ${flags.agent})`);
    process.exit(2);
  }
  const runs = Number(flags.runs);
  const pages = Number(flags.pages);
  const timeoutMs = Number(flags.timeout);
  if (
    !Number.isInteger(runs) ||
    runs < 1 ||
    !Number.isInteger(pages) ||
    pages < 1 ||
    !(timeoutMs > 0)
  ) {
    console.error('--runs and --pages must be positive integers, --timeout a positive number');
    process.exit(2);
  }
  const datasetFile = resolve(flags.dataset);
  const datasetName = basename(datasetFile).replace(/\.json$/i, '');
  const outDir = resolve(
    flags.out ?? join(REPO_ROOT, 'benchmark', 'results', `${datasetName}-${timestamp(new Date())}`),
  );
  const browserPath = flags.browserPath ?? process.env.AWC_BROWSER_PATH ?? undefined;
  const log = flags.quiet ? () => {} : (m: string) => process.stderr.write(`› ${m}\n`);

  runBenchmark({
    datasetFile,
    agent: flags.agent,
    runs,
    outDir,
    only: flags.only
      ? flags.only
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : null,
    pages,
    pagesExplicit: process.argv.includes('--pages'),
    browserPath,
    timeoutMs,
    log,
  })
    .then(({ aggregate }) => {
      const t = aggregate.totals;
      process.stdout.write(
        `${aggregate.dataset.name} v${aggregate.dataset.version}: ${t.completed}/${t.entries} entries completed, mean overall ${t.meanOverall ?? 'n/a'}, verdicts PASS ${t.verdicts.PASS} / FAIL ${t.verdicts.FAIL} / BLOCKED ${t.verdicts.BLOCKED} / INCONCLUSIVE ${t.verdicts.INCONCLUSIVE}, fixture mismatches ${t.checkMismatches} checks / ${t.taskMismatches} tasks\n`,
      );
      process.stdout.write(`results: ${outDir}\n`);
      process.exitCode = t.failed > 0 ? 1 : 0;
    })
    .catch((err: unknown) => {
      console.error(err instanceof Error ? (err.stack ?? err.message) : err);
      process.exitCode = 2;
    });
}
