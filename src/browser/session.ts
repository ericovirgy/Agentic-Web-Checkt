import { existsSync } from 'node:fs';
import { AxeBuilder } from '@axe-core/playwright';
import type { AxeResults } from 'axe-core';
import { type Browser, type BrowserContext, chromium, type Page } from 'playwright';
import type { PageSummary } from '../types.js';
import { INIT_SCRIPT } from './init-script.js';
import { PAGE_DATA_ARGS, PAGE_DATA_SCRIPT, type PageData } from './page-data.js';
import { buildSnapshot, type Snapshot } from './snapshot.js';

export const TOOL_USER_AGENT_SUFFIX = 'AgenticWebCheck';

export interface BrowserOptions {
  browserPath?: string;
  headless?: boolean;
  userAgent?: string;
  version: string;
  ignoreHttpsErrors?: boolean;
}

export function resolveBrowserPath(explicit?: string): string | undefined {
  const candidates = [explicit, process.env.AWC_BROWSER_PATH].filter(Boolean) as string[];
  for (const c of candidates) {
    if (existsSync(c)) return c;
    throw new Error(`Browser executable not found: ${c}`);
  }
  return undefined;
}

export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  userAgent: string;
  browserVersion: string;
  newPage(): Promise<Page>;
  close(): Promise<void>;
}

export async function launchBrowser(opts: BrowserOptions): Promise<BrowserSession> {
  const executablePath = resolveBrowserPath(opts.browserPath);
  const browser = await chromium.launch({
    headless: opts.headless ?? true,
    executablePath,
    args: [
      '--disable-dev-shm-usage',
      // No background traffic to Google services: the only network calls are to the target site.
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-sync',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-domain-reliability',
      '--disable-client-side-phishing-detection',
      '--metrics-recording-only',
      '--disable-features=OptimizationHints,OptimizationGuideModelDownloading,MediaRouter,Translate,InterestFeedContentSuggestions,CalculateNativeWinOcclusion,AutofillServerCommunication',
    ],
  });
  const probe = await browser.newContext();
  const probePage = await probe.newPage();
  const defaultUa = await probePage.evaluate(() => navigator.userAgent);
  await probe.close();
  // Honest UA: default Chromium UA plus our token, as crawlers conventionally do.
  const userAgent =
    opts.userAgent ??
    `${defaultUa.replace(/HeadlessChrome/, 'Chrome')} ${TOOL_USER_AGENT_SUFFIX}/${opts.version}`;
  const context = await browser.newContext({
    userAgent,
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
    ignoreHTTPSErrors: opts.ignoreHttpsErrors ?? false,
  });
  await context.addInitScript(INIT_SCRIPT);
  return {
    browser,
    context,
    userAgent,
    browserVersion: browser.version(),
    newPage: () => context.newPage(),
    close: async () => {
      await context.close().catch(() => {});
      await browser.close().catch(() => {});
    },
  };
}

export interface LoadedPage {
  page: Page;
  url: string;
  finalUrl: string;
  status: number | null;
  headers: Record<string, string>;
  loadMs: number;
  networkIdle: boolean;
  consoleErrors: string[];
  failedScripts: string[];
  snapshot: Snapshot;
  data: PageData;
  axe: AxeResults | null;
  summary: PageSummary;
  error?: string;
}

export interface LoadOptions {
  timeoutMs: number;
  settleMs?: number;
  axe?: boolean;
  log?: (m: string) => void;
}

export const AXE_RULES = [
  'button-name',
  'link-name',
  'label',
  'select-name',
  'input-button-name',
  'image-alt',
  'svg-img-alt',
  'role-img-alt',
  'input-image-alt',
  'document-title',
  'html-has-lang',
  'html-lang-valid',
  'aria-allowed-attr',
  'aria-required-attr',
  'aria-required-children',
  'aria-required-parent',
  'aria-roles',
  'aria-valid-attr',
  'aria-valid-attr-value',
  'aria-hidden-body',
  'aria-hidden-focus',
  'aria-prohibited-attr',
  'aria-command-name',
  'aria-input-field-name',
  'aria-toggle-field-name',
  'label-content-name-mismatch',
  'page-has-heading-one',
  'heading-order',
  'empty-heading',
  'landmark-one-main',
  'bypass',
  'region',
  'form-field-multiple-labels',
  'autocomplete-valid',
  'tabindex',
  'target-size',
  'duplicate-id-aria',
  'nested-interactive',
  'presentation-role-conflict',
  'frame-title',
  'scrollable-region-focusable',
];

export async function snapshotPage(page: Page): Promise<Snapshot> {
  const [json, text] = await Promise.all([
    page.ariaSnapshotJSON({ mode: 'ai', timeout: 10_000 }).catch(() => []),
    page.ariaSnapshot({ mode: 'ai', timeout: 10_000 }).catch(() => ''),
  ]);
  return buildSnapshot(json, text);
}

export async function collectPageData(page: Page): Promise<PageData> {
  const data = (await page.evaluate(`(${PAGE_DATA_SCRIPT})(${JSON.stringify(PAGE_DATA_ARGS)})`)) as
    | PageData
    | undefined;
  if (!data || typeof data !== 'object') throw new Error('page data script returned nothing');
  return data;
}

export async function runAxe(page: Page): Promise<AxeResults | null> {
  try {
    return await new AxeBuilder({ page }).withRules(AXE_RULES).analyze();
  } catch {
    return null;
  }
}

/**
 * Navigate, wait for the page to settle (load + network idle up to a budget + settle window),
 * then collect snapshot, DOM data and axe results.
 */
export async function loadPage(page: Page, url: string, opts: LoadOptions): Promise<LoadedPage> {
  const consoleErrors: string[] = [];
  const failedScripts: string[] = [];
  const onConsole = (msg: { type(): string; text(): string }) => {
    // Resource failures are tracked through responses (with URLs); console only keeps script errors.
    if (
      msg.type() === 'error' &&
      consoleErrors.length < 50 &&
      !/^Failed to load resource/.test(msg.text())
    )
      consoleErrors.push(msg.text().slice(0, 300));
  };
  const onResponse = (res: {
    status(): number;
    url(): string;
    request(): { resourceType(): string };
  }) => {
    const type = res.request().resourceType();
    if (
      res.status() >= 400 &&
      failedScripts.length < 20 &&
      /^(script|stylesheet|document|fetch|xhr)$/.test(type) &&
      !/favicon|apple-touch-icon/i.test(res.url())
    )
      failedScripts.push(`${res.url()} (HTTP ${res.status()}, ${type})`);
  };
  const onPageError = (err: Error) => {
    if (consoleErrors.length < 50)
      consoleErrors.push(`Uncaught: ${String(err.message ?? err).slice(0, 300)}`);
  };
  const onRequestFailed = (req: { url(): string; resourceType(): string }) => {
    if (req.resourceType() === 'script' && failedScripts.length < 20) failedScripts.push(req.url());
  };
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  page.on('requestfailed', onRequestFailed);
  page.on('response', onResponse);

  const started = Date.now();
  let status: number | null = null;
  let headers: Record<string, string> = {};
  let error: string | undefined;
  let networkIdle = false;
  try {
    const resp = await page.goto(url, { waitUntil: 'load', timeout: opts.timeoutMs });
    status = resp?.status() ?? null;
    headers = resp?.headers() ?? {};
    try {
      await page.waitForLoadState('networkidle', { timeout: Math.min(10_000, opts.timeoutMs) });
      networkIdle = true;
    } catch {
      networkIdle = false;
    }
  } catch (e) {
    error = String((e as Error).message ?? e).split('\n')[0];
  }
  const loadMs = Date.now() - started;

  // Mark settle point for mutation counting, then wait the settle window.
  await page
    .evaluate(() => {
      const s = (window as unknown as { __awc?: { settled: boolean } }).__awc;
      if (s) s.settled = true;
    })
    .catch(() => {});
  await page.waitForTimeout(opts.settleMs ?? 2000);

  const snapshot = error ? buildSnapshot([], '') : await snapshotPage(page);
  const data = error
    ? emptyPageData()
    : await collectPageData(page).catch((e) => {
        opts.log?.(`page data collection failed: ${String(e)}`);
        return emptyPageData();
      });
  const axe = error || opts.axe === false ? null : await runAxe(page);

  page.off('console', onConsole);
  page.off('pageerror', onPageError);
  page.off('requestfailed', onRequestFailed);
  page.off('response', onResponse);

  const finalUrl = error || page.url() === 'about:blank' ? url : page.url();
  const summary: PageSummary = {
    url,
    finalUrl,
    status,
    title: data.title,
    loadMs,
    interactiveCount: snapshot.nodes.filter((n) => n.ref && isInteractiveRole(n.role)).length,
    snapshotChars: snapshot.chars,
    consoleErrors: consoleErrors.length,
    error,
  };
  return {
    page,
    url,
    finalUrl,
    status,
    headers,
    loadMs,
    networkIdle,
    consoleErrors,
    failedScripts,
    snapshot,
    data,
    axe,
    summary,
    error,
  };
}

function isInteractiveRole(role: string): boolean {
  return (
    role === 'button' ||
    role === 'link' ||
    role === 'textbox' ||
    role === 'searchbox' ||
    role === 'combobox' ||
    role === 'checkbox' ||
    role === 'radio' ||
    role === 'switch' ||
    role === 'slider' ||
    role === 'spinbutton' ||
    role === 'tab' ||
    role === 'menuitem' ||
    role === 'listbox'
  );
}

export function emptyPageData(): PageData {
  return {
    title: '',
    lang: '',
    textLength: 0,
    htmlLength: 0,
    hiddenBlocks: [],
    htmlComments: [],
    forms: [],
    links: [],
    overlays: [],
    nonSemanticClickables: [],
    landmarks: { main: 0, nav: 0, search: 0, banner: 0, contentinfo: 0 },
    headings: [],
    jsonLd: [],
    canvas: { coverage: 0, count: 0 },
    iframes: [],
    passwordFieldsOutsideForms: 0,
    looseFields: { count: 0, unnamed: 0 },
    inputTypeSearch: 0,
    customWidgets: [],
    draggables: 0,
    contentEditable: 0,
    positiveTabindex: 0,
    consequentialControls: [],
    secretHits: [],
    webmcp: {
      api: null,
      native: false,
      tools: [],
      declarativeForms: 0,
      polyfillFingerprint: false,
    },
    closedShadowRoots: 0,
    closedShadowHosts: [],
    clickListenerCount: 0,
    mutations: 0,
    mutationsAfterSettle: 0,
    cls: 0,
    runtimeErrors: [],
    challengeMarkers: [],
    viewport: { width: 0, height: 0 },
  };
}
