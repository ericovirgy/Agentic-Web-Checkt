import { mkdirSync } from 'node:fs';
import { parseRobots, probeSite, robotsAllows } from './browser/probes.js';
import {
  type LoadedPage,
  launchBrowser,
  loadPage,
  TOOL_USER_AGENT_SUFFIX,
} from './browser/session.js';
import { interactiveNodes } from './browser/snapshot.js';
import { ALL_CHECKS, type CheckContext, runChecks } from './checks/index.js';
import { KEY_PAGE_VOCAB, matchesVocab } from './checks/navigation.js';
import { computeScores, suggestedFixes } from './scoring/index.js';
import { runTasks } from './tasks/runner.js';
import { isConsequentialName } from './tasks/tools.js';
import {
  METHODOLOGY_VERSION,
  RESULT_SCHEMA_VERSION,
  type ScanOptions,
  type ScanResult,
  type TaskResult,
} from './types.js';
import { toolVersion } from './util/version.js';

export const DEFAULT_TIMEOUT_MS = 30_000;

/** Pick up to `max` same-origin pages linked from the start page, preferring agent-relevant destinations. */
export function pickPagesToScan(
  start: LoadedPage,
  max: number,
  allowed: (url: string) => boolean = () => true,
): string[] {
  const origin = new URL(start.finalUrl).origin;
  const seen = new Set<string>([normalise(start.finalUrl)]);
  const candidates: { url: string; priority: number }[] = [];
  const links = interactiveNodes(start.snapshot).filter((n) => n.role === 'link' && n.url);
  for (const l of links) {
    let abs: URL;
    try {
      abs = new URL(l.url as string, start.finalUrl);
    } catch {
      continue;
    }
    if (abs.origin !== origin || !/^https?:$/.test(abs.protocol)) continue;
    // Never follow consequential links during a scan (delete, pay, unsubscribe…).
    if (
      isConsequentialName(l.name) ||
      /[?&](confirm|delete|remove|action|do|logout|unsubscribe)=/i.test(abs.search)
    )
      continue;
    // Keep hash-router paths (#/route) as distinct pages; drop plain fragments.
    if (!abs.hash.startsWith('#/')) abs.hash = '';
    if (!allowed(abs.toString())) continue;
    const key = normalise(abs.toString());
    if (seen.has(key)) continue;
    if (/\.(pdf|zip|png|jpe?g|gif|svg|xml|txt|css|js)$/i.test(abs.pathname)) continue;
    seen.add(key);
    let priority = 0;
    for (const vocab of Object.values(KEY_PAGE_VOCAB))
      if (matchesVocab(l.name, vocab)) priority += 2;
    if (
      /product|pricing|shop|store|docs|contact|help|about|search|login|signin|cart|checkout/i.test(
        abs.pathname,
      )
    )
      priority += 1;
    candidates.push({ url: abs.toString(), priority });
  }
  candidates.sort((a, b) => b.priority - a.priority);
  return candidates.slice(0, max).map((c) => c.url);
}

function normalise(u: string): string {
  return u.replace(/\/+$/, '').replace(/^https?:\/\/www\./, 'https://');
}

export async function scan(options: ScanOptions): Promise<ScanResult> {
  const log = options.log ?? (() => {});
  const version = toolVersion();
  const startedAt = new Date();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const url = normaliseInputUrl(options.url);
  if (options.outputDir) mkdirSync(options.outputDir, { recursive: true });

  const session = await launchBrowser({
    browserPath: options.browserPath,
    headless: options.headless,
    userAgent: options.userAgent,
    version,
    ignoreHttpsErrors: options.ignoreHttpsErrors ?? process.env.AWC_INSECURE === '1',
  });
  const pages: LoadedPage[] = [];
  let tasks: TaskResult[] = [];
  try {
    log(`loading ${url}`);
    const page = await session.newPage();
    const start = await loadPage(page, url, { timeoutMs, log });
    pages.push(start);
    log(
      start.error
        ? `start page failed: ${start.error}`
        : `loaded ${start.finalUrl} (HTTP ${start.status}, ${start.snapshot.nodes.length} nodes)`,
    );

    // robots.txt is fetched first so that additional pages are only picked where our UA may crawl.
    const probes = await probeSite(start.finalUrl || url, session.userAgent, log);
    const robots = probes.robots.ok ? parseRobots(probes.robots.body) : null;
    const allowedByRobots = (candidate: string) =>
      !robots || robotsAllows(robots, TOOL_USER_AGENT_SUFFIX, new URL(candidate).pathname).allowed;
    const extra = start.error
      ? []
      : pickPagesToScan(start, Math.max(0, (options.pages ?? 3) - 1), allowedByRobots);
    for (const extraUrl of extra) {
      log(`loading ${extraUrl}`);
      const p = await session.newPage();
      const loaded = await loadPage(p, extraUrl, { timeoutMs, log });
      // A linked page that redirects to another origin (SSO, external login) is not part of the site.
      if (!loaded.error && new URL(loaded.finalUrl).origin !== new URL(start.finalUrl).origin) {
        loaded.error = `redirected off-origin to ${loaded.finalUrl}`;
        loaded.summary.error = loaded.error;
        log(`skipping ${extraUrl}: ${loaded.error}`);
      }
      pages.push(loaded);
      await p.close().catch(() => {});
    }
    const ctx: CheckContext = { options, pages, start, probes, userAgent: session.userAgent, log };
    log(`running ${ALL_CHECKS.length} checks`);
    const checks = await runChecks(ALL_CHECKS, ctx);
    await page.close().catch(() => {});

    if (options.tasks && options.tasks.length > 0) {
      log(`running ${options.tasks.length} tasks with the ${options.agent ?? 'baseline'} agent`);
      tasks = await runTasks(session, options.tasks, {
        ...options,
        url: start.finalUrl || url,
        timeoutMs,
        version,
        log,
      });
    }

    const { overall, dimensions } = computeScores(checks, tasks);
    const finishedAt = new Date();
    return {
      meta: {
        tool: 'agentic-web-check',
        version,
        methodology: METHODOLOGY_VERSION,
        schema: RESULT_SCHEMA_VERSION,
        mode: tasks.length > 0 ? 'behavioural' : 'deterministic',
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        url,
        browser: {
          name: 'chromium',
          version: session.browserVersion,
          userAgent: session.userAgent,
        },
        options: {
          pages: options.pages ?? 3,
          timeoutMs,
          agent: options.agent ?? null,
          model: options.llm?.model ?? null,
          tasks: options.tasks?.length ?? 0,
          allowForms: !!options.allowForms,
          allowConsequential: !!options.allowConsequential,
        },
        node: process.version,
      },
      overall,
      dimensions,
      checks,
      tasks,
      pages: pages.map((p) => p.summary),
      suggestedFixes: suggestedFixes(checks),
    };
  } finally {
    await session.close();
  }
}

export function normaliseInputUrl(input: string): string {
  const trimmed = input.trim();
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  // Credentials in the URL would otherwise end up in logs, JSON, HTML and PR comments.
  const u = new URL(withScheme);
  u.username = '';
  u.password = '';
  return u.toString();
}
