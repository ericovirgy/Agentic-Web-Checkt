import type { Page } from 'playwright';
import type { Assertion, AssertionResult } from '../types.js';

export function normaliseText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[​-‍﻿]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface PageState {
  url: string;
  title: string;
  text: string;
  /** role/name pairs from the AI snapshot. */
  elements: { role: string; name: string; checked?: boolean | 'mixed'; disabled?: boolean }[];
}

export async function capturePageState(page: Page): Promise<PageState> {
  const url = page.url();
  const title = await page.title().catch(() => '');
  const text = await page
    .evaluate(() => (document.body ? document.body.innerText : ''))
    .catch(() => '');
  const json = (await page
    .ariaSnapshotJSON({ mode: 'ai', timeout: 10_000 })
    .catch(() => [])) as unknown[];
  const elements: PageState['elements'] = [];
  const walk = (n: unknown) => {
    if (!n || typeof n !== 'object') return;
    const o = n as {
      role?: string;
      name?: string;
      checked?: boolean | 'mixed';
      disabled?: boolean;
      children?: unknown[];
    };
    if (o.role)
      elements.push({
        role: o.role,
        name: (o.name ?? '').trim(),
        checked: o.checked,
        disabled: o.disabled,
      });
    for (const c of o.children ?? []) walk(c);
  };
  for (const r of json) walk(r);
  return { url, title, text: text.slice(0, 200_000), elements };
}

export function evaluateAssertion(
  a: Assertion,
  state: PageState,
  answer: string | undefined,
): AssertionResult {
  if ('any_of' in a) {
    const results = a.any_of.map((x) => evaluateAssertion(x, state, answer));
    return {
      assertion: a,
      holds: results.some((r) => r.holds),
      observed: results
        .map((r) => r.observed ?? '')
        .filter(Boolean)
        .join(' | '),
    };
  }
  if ('url' in a) {
    const u = state.url;
    const { includes, equals, regex } = a.url;
    let holds = true;
    if (includes !== undefined) holds &&= u.toLowerCase().includes(includes.toLowerCase());
    if (equals !== undefined) holds &&= u.replace(/\/+$/, '') === equals.replace(/\/+$/, '');
    if (regex !== undefined) holds &&= new RegExp(regex, 'i').test(u);
    return { assertion: a, holds, observed: `url=${u}` };
  }
  if ('text' in a) {
    const holds = normaliseText(state.text).includes(normaliseText(a.text.includes));
    return {
      assertion: a,
      holds,
      observed: holds
        ? 'text found'
        : `text "${a.text.includes}" not found in ${state.text.length} chars`,
    };
  }
  if ('title' in a) {
    const holds = normaliseText(state.title).includes(normaliseText(a.title.includes));
    return { assertion: a, holds, observed: `title="${state.title}"` };
  }
  if ('element' in a) {
    const { role, name, state: st } = a.element;
    const matches = state.elements.filter(
      (e) =>
        e.role === role &&
        (name === undefined || normaliseText(e.name).includes(normaliseText(name))),
    );
    let holds = matches.length > 0;
    if (holds && st === 'checked') holds = matches.some((m) => m.checked === true);
    if (holds && st === 'disabled') holds = matches.some((m) => m.disabled === true);
    return {
      assertion: a,
      holds,
      observed: holds
        ? `${matches.length} matching ${role}`
        : `no ${role}${name ? ` named "${name}"` : ''}`,
    };
  }
  if ('answer' in a) {
    const ans = normaliseText(answer ?? '');
    const { must_include, exact_match } = a.answer;
    let holds = ans.length > 0;
    if (must_include) holds &&= must_include.every((m) => ans.includes(normaliseText(m)));
    if (exact_match !== undefined) holds &&= ans === normaliseText(exact_match);
    return {
      assertion: a,
      holds,
      observed: answer ? `answer="${answer.slice(0, 120)}"` : 'no answer returned',
    };
  }
  return { assertion: a, holds: false, observed: 'unknown assertion' };
}

export function evaluateAll(
  assertions: Assertion[],
  state: PageState,
  answer: string | undefined,
): AssertionResult[] {
  return assertions.map((a) => evaluateAssertion(a, state, answer));
}
