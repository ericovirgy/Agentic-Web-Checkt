import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import type { Assertion, TaskDefinition } from '../types.js';

/**
 * Built-in task archetypes: site-generic goals with programmatic success criteria.
 * They are deliberately conservative (read-only) and form the basis of the benchmark.
 */
export const DEFAULT_TASKS: TaskDefinition[] = [
  {
    name: 'contact',
    goal: "Find the company's contact information (an email address or phone number).",
    hints: ['contact', 'contact us', 'get in touch', 'support'],
    safety: 'read-only',
    max_steps: 12,
    success: [
      {
        any_of: [
          { text: { includes: '@' } },
          { url: { regex: 'contact|contacto|support|kontakt' } },
          { element: { role: 'link', name: 'mailto' } },
        ],
      },
    ],
  },
  {
    name: 'legal-policy',
    goal: 'Find the page describing the privacy policy or terms of service.',
    hints: ['privacy', 'privacy policy', 'terms', 'legal'],
    safety: 'read-only',
    max_steps: 12,
    success: [
      {
        any_of: [
          { url: { regex: 'privacy|terms|legal|privacidade|termos' } },
          { element: { role: 'heading', name: 'privacy' } },
          { element: { role: 'heading', name: 'terms' } },
        ],
      },
    ],
  },
  {
    name: 'help-or-about',
    goal: 'Find a page that explains what the company or product does (about, help or documentation).',
    hints: ['about', 'about us', 'help', 'docs', 'documentation', 'faq'],
    safety: 'read-only',
    max_steps: 12,
    success: [
      {
        any_of: [
          { url: { regex: 'about|help|docs|faq|support|sobre|ajuda' } },
          { element: { role: 'heading', name: 'about' } },
          { element: { role: 'heading', name: 'help' } },
          { element: { role: 'heading', name: 'faq' } },
        ],
      },
    ],
  },
];

const ASSERTION_KEYS = ['url', 'text', 'title', 'element', 'answer', 'any_of', 'navigated'];

export function parseAssertion(raw: unknown, path: string): Assertion {
  if (!raw || typeof raw !== 'object') throw new Error(`${path}: assertion must be an object`);
  const o = raw as Record<string, unknown>;
  // Fixture/benchmark shorthand: { type: "url", includes: "..." }
  if (typeof o.type === 'string') {
    const { type, ...rest } = o;
    if (type === 'any_of')
      return {
        any_of: ((rest.any_of as unknown[]) ?? []).map((x, i) =>
          parseAssertion(x, `${path}.any_of[${i}]`),
        ),
      };
    return parseAssertion({ [type]: rest }, path);
  }
  const keys = Object.keys(o).filter((k) => ASSERTION_KEYS.includes(k));
  if (keys.length !== 1)
    throw new Error(`${path}: assertion must have exactly one of ${ASSERTION_KEYS.join(', ')}`);
  const key = keys[0] as string;
  if (key === 'any_of')
    return {
      any_of: ((o.any_of as unknown[]) ?? []).map((x, i) =>
        parseAssertion(x, `${path}.any_of[${i}]`),
      ),
    };
  if (key === 'navigated') return { navigated: true };
  const value = o[key];
  if (!value || typeof value !== 'object') throw new Error(`${path}.${key}: must be an object`);
  return { [key]: value } as Assertion;
}

export function parseTaskDefinition(raw: unknown, path = 'task'): TaskDefinition {
  if (!raw || typeof raw !== 'object') throw new Error(`${path}: must be an object`);
  const o = raw as Record<string, unknown>;
  if (typeof o.name !== 'string' || !o.name) throw new Error(`${path}: name is required`);
  if (typeof o.goal !== 'string' || !o.goal)
    throw new Error(`${path} (${o.name}): goal is required`);
  const successRaw = (o.success ?? o.assert ?? []) as unknown[];
  if (!Array.isArray(successRaw) || successRaw.length === 0)
    throw new Error(`${path} (${o.name}): success must be a non-empty list of assertions`);
  const safety = (o.safety ?? 'read-only') as string;
  if (!['read-only', 'form-submit', 'consequential'].includes(safety))
    throw new Error(`${path} (${o.name}): safety must be read-only, form-submit or consequential`);
  return {
    name: o.name,
    goal: o.goal,
    start: typeof o.start === 'string' ? o.start : undefined,
    success: successRaw.map((s, i) => parseAssertion(s, `${path} (${o.name}).success[${i}]`)),
    safety: safety as TaskDefinition['safety'],
    max_steps: typeof o.max_steps === 'number' ? o.max_steps : undefined,
    hints: Array.isArray(o.hints) ? o.hints.map(String) : undefined,
    data:
      o.data && typeof o.data === 'object'
        ? Object.fromEntries(
            Object.entries(o.data as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
          )
        : undefined,
  };
}

export function loadTasksFile(file: string): TaskDefinition[] {
  const doc = parse(readFileSync(file, 'utf8')) as unknown;
  const list = Array.isArray(doc) ? doc : (doc as { tasks?: unknown[] })?.tasks;
  if (!Array.isArray(list)) throw new Error(`${file}: expected a top-level "tasks:" list`);
  return list.map((t, i) => parseTaskDefinition(t, `${file} tasks[${i}]`));
}

export function resolveTasks(spec: string | undefined): TaskDefinition[] {
  if (!spec) return [];
  if (spec === 'default') return DEFAULT_TASKS;
  return loadTasksFile(spec);
}
