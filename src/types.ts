/**
 * Public result types. The JSON output of the CLI is exactly `ScanResult`.
 * Methodology version is bumped when any weight, threshold or verdict rule changes.
 */

export const METHODOLOGY_VERSION = '1';
export const RESULT_SCHEMA_VERSION = '1';

export type Dimension =
  | 'perception'
  | 'navigation'
  | 'interaction'
  | 'machine-interfaces'
  | 'reliability'
  | 'safety'
  | 'task-success';

export const DIMENSIONS: Dimension[] = [
  'perception',
  'navigation',
  'interaction',
  'machine-interfaces',
  'reliability',
  'safety',
  'task-success',
];

export const DIMENSION_LABELS: Record<Dimension, string> = {
  perception: 'PERCEPTION',
  navigation: 'NAVIGATION',
  interaction: 'INTERACTION',
  'machine-interfaces': 'MACHINE INTERFACES',
  reliability: 'RELIABILITY',
  safety: 'SAFETY',
  'task-success': 'TASK SUCCESS',
};

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'na' | 'info';
export type CheckWeight = 1 | 3 | 7 | 10;

export interface EvidenceItem {
  url?: string;
  /** Playwright ref from the AI snapshot (e.g. e12, f1e3) when available. */
  ref?: string;
  /** CSS selector or path, when available. */
  selector?: string;
  /** Short serialisation of the element (role, name, tag, attributes). */
  element?: string;
  observed?: string;
  expected?: string;
  /** Free-form note (never longer than a few hundred chars). */
  note?: string;
}

export interface CheckResult {
  id: string;
  title: string;
  dimension: Dimension;
  weight: CheckWeight;
  status: CheckStatus;
  /** 1 pass, 0.5 warn, 0 fail; undefined for na/info. */
  score?: number;
  /** One-line human summary of what was observed. */
  summary: string;
  /** Why this check exists: standard, audit id or documented failure mode. */
  rationale: string;
  references: string[];
  remediation?: string;
  evidence: EvidenceItem[];
  /** Arbitrary counters for machine consumers (e.g. { interactive: 42, unnamed: 3 }). */
  metrics?: Record<string, number | string | boolean>;
  /** Pages this check inspected. */
  pages?: string[];
  durationMs?: number;
  /** Set when the check itself crashed; status is then `na`. */
  error?: string;
}

export interface DimensionScore {
  dimension: Dimension;
  label: string;
  /** 0..100 or null when no scorable checks. */
  score: number | null;
  weight: number;
  checks: string[];
  passed: number;
  warned: number;
  failed: number;
}

export type TaskVerdict = 'PASS' | 'FAIL' | 'BLOCKED' | 'INCONCLUSIVE';
export type TaskSafety = 'read-only' | 'form-submit' | 'consequential';
export type AgentKind = 'baseline' | 'llm';

export type Assertion =
  | { url: { includes?: string; equals?: string; regex?: string } }
  | { text: { includes: string } }
  | { title: { includes: string } }
  | {
      element: {
        role: string;
        name?: string;
        url?: string;
        state?: 'visible' | 'checked' | 'disabled';
      };
    }
  /** Final URL differs from the task start URL (at least one navigation happened). */
  | { navigated: true }
  | { answer: { must_include?: string[]; exact_match?: string } }
  | { any_of: Assertion[] };

export interface TaskDefinition {
  name: string;
  goal: string;
  /** Path or absolute URL to start from; defaults to the scan URL. */
  start?: string;
  success: Assertion[];
  safety?: TaskSafety;
  max_steps?: number;
  /** Keyword hints for the baseline agent (accessible-name vocabulary). */
  hints?: string[];
  /** Synthetic form data the agent may use, keyed by field vocabulary. */
  data?: Record<string, string>;
}

export interface TaskStep {
  index: number;
  tool: string;
  args: Record<string, unknown>;
  /** Result summary returned to the agent (truncated). */
  result: string;
  url: string;
  durationMs: number;
  /** Snapshot before the action (truncated). */
  snapshotBefore?: string;
  /** True when the snapshot did not change after a mutating action. */
  noFeedback?: boolean;
  error?: string;
}

export interface AssertionResult {
  assertion: Assertion;
  holds: boolean;
  observed?: string;
}

export interface TaskResult {
  name: string;
  goal: string;
  verdict: TaskVerdict;
  reason: string;
  agent: AgentKind;
  model?: string;
  safety: TaskSafety;
  startUrl: string;
  finalUrl: string;
  finalTitle: string;
  steps: TaskStep[];
  assertions: AssertionResult[];
  answer?: string;
  blocker?: BlockerKind;
  screenshots: { label: string; path: string }[];
  consoleErrors: string[];
  durationMs: number;
  usage?: { inputTokens: number; outputTokens: number; calls: number };
  error?: string;
}

export type BlockerKind =
  | 'captcha'
  | 'bot-wall'
  | 'login-required'
  | 'consent-overlay'
  | 'consequential-step'
  | 'http-error';

export interface PageSummary {
  url: string;
  finalUrl: string;
  status: number | null;
  title: string;
  loadMs: number;
  interactiveCount: number;
  snapshotChars: number;
  consoleErrors: number;
  error?: string;
}

export interface ScanMeta {
  tool: 'agentic-web-check';
  version: string;
  methodology: string;
  schema: string;
  mode: 'deterministic' | 'behavioural';
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  url: string;
  browser: { name: string; version: string; userAgent: string };
  options: Record<string, unknown>;
  node: string;
}

export interface ScanResult {
  meta: ScanMeta;
  overall: number | null;
  dimensions: DimensionScore[];
  checks: CheckResult[];
  tasks: TaskResult[];
  pages: PageSummary[];
  /** Short, ordered list of the most valuable fixes (derived from failed/warned checks by weight). */
  suggestedFixes: { checkId: string; title: string; remediation: string; weight: number }[];
}

export interface ScanOptions {
  url: string;
  pages?: number;
  timeoutMs?: number;
  browserPath?: string;
  headless?: boolean;
  /** Accept invalid TLS certificates (staging hosts, corporate MITM proxies). Off by default. */
  ignoreHttpsErrors?: boolean;
  userAgent?: string;
  tasks?: TaskDefinition[];
  agent?: AgentKind;
  llm?: LlmOptions;
  allowForms?: boolean;
  allowConsequential?: boolean;
  outputDir?: string;
  screenshots?: boolean;
  /** Only run checks with these ids (debug). */
  onlyChecks?: string[];
  lighthouse?: boolean;
  log?: (message: string) => void;
}

export interface LlmOptions {
  provider: 'openai' | 'anthropic';
  model: string;
  apiKey?: string;
  baseUrl?: string;
  maxSteps?: number;
}
