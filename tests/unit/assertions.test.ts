import { describe, expect, it } from 'vitest';
import {
  evaluateAll,
  evaluateAssertion,
  normaliseText,
  type PageState,
} from '../../src/tasks/assertions.js';
import type { Assertion } from '../../src/types.js';

const state: PageState = {
  url: 'http://127.0.0.1:4311/contact.html?x=1',
  startUrl: 'http://127.0.0.1:4311/',
  title: 'Contact | Northwind Bikes',
  text: 'Email hello@northwind.example or call +1 555 010 0199.\n\nReturns within 30 days.',
  elements: [
    { role: 'heading', name: 'Contact us' },
    { role: 'link', name: 'hello@northwind.example', url: 'mailto:hello@northwind.example' },
    { role: 'link', name: 'Privacy policy', url: 'privacy.html' },
    { role: 'checkbox', name: 'Keep me signed in', checked: true },
    { role: 'checkbox', name: 'Newsletter', checked: false },
    { role: 'button', name: 'Place order', disabled: true },
    { role: 'button', name: 'Send message' },
  ],
};

describe('normaliseText', () => {
  it('lowercases and collapses whitespace', () => {
    expect(normaliseText('  Hello   WORLD \n\t x ')).toBe('hello world x');
  });
  it('strips accents (NFKD + combining marks)', () => {
    expect(normaliseText('Devoluções e Preços')).toBe('devolucoes e precos');
    expect(normaliseText('Crème Brûlée')).toBe('creme brulee');
  });
  it('removes zero-width characters', () => {
    expect(normaliseText('I​g​n​o​r​e')).toBe('ignore');
    expect(normaliseText('a‌‍﻿b')).toBe('ab');
  });
  it('normalises compatibility characters', () => {
    expect(normaliseText('ﬁle')).toBe('file');
    expect(normaliseText('ＡＢＣ')).toBe('abc');
  });
});

describe('evaluateAssertion: url', () => {
  it('includes is case-insensitive', () => {
    const r = evaluateAssertion({ url: { includes: 'CONTACT.html' } }, state, undefined);
    expect(r.holds).toBe(true);
    expect(r.observed).toBe(`url=${state.url}`);
    expect(evaluateAssertion({ url: { includes: 'returns' } }, state, undefined).holds).toBe(false);
  });
  it('equals ignores trailing slashes', () => {
    const s = { ...state, url: 'http://x.test/a/' };
    expect(evaluateAssertion({ url: { equals: 'http://x.test/a' } }, s, undefined).holds).toBe(
      true,
    );
    expect(evaluateAssertion({ url: { equals: 'http://x.test/b' } }, s, undefined).holds).toBe(
      false,
    );
  });
  it('regex is case-insensitive and combines with other fields', () => {
    expect(evaluateAssertion({ url: { regex: 'contact|kontakt' } }, state, undefined).holds).toBe(
      true,
    );
    expect(
      evaluateAssertion({ url: { regex: 'CONTACT', includes: 'nope' } }, state, undefined).holds,
    ).toBe(false);
  });
  it('an empty url assertion holds', () => {
    expect(evaluateAssertion({ url: {} }, state, undefined).holds).toBe(true);
  });
});

describe('evaluateAssertion: text and title', () => {
  it('text matches after normalisation', () => {
    expect(
      evaluateAssertion({ text: { includes: 'HELLO@northwind.example' } }, state, undefined).holds,
    ).toBe(true);
    expect(evaluateAssertion({ text: { includes: '30   days' } }, state, undefined)).toMatchObject({
      holds: true,
      observed: 'text found',
    });
    const miss = evaluateAssertion({ text: { includes: 'free shipping' } }, state, undefined);
    expect(miss.holds).toBe(false);
    expect(miss.observed).toContain('not found');
  });
  it('title matches after normalisation', () => {
    expect(evaluateAssertion({ title: { includes: 'northwind BIKES' } }, state, undefined)).toEqual(
      {
        assertion: { title: { includes: 'northwind BIKES' } },
        holds: true,
        observed: `title="${state.title}"`,
      },
    );
    expect(evaluateAssertion({ title: { includes: 'Returns' } }, state, undefined).holds).toBe(
      false,
    );
  });
});

describe('evaluateAssertion: element', () => {
  it('matches by role alone', () => {
    const r = evaluateAssertion({ element: { role: 'heading' } }, state, undefined);
    expect(r.holds).toBe(true);
    expect(r.observed).toBe('1 matching heading');
  });
  it('matches by role and (normalised, partial) name', () => {
    expect(
      evaluateAssertion({ element: { role: 'heading', name: 'contact' } }, state, undefined).holds,
    ).toBe(true);
    expect(
      evaluateAssertion({ element: { role: 'link', name: 'privacy' } }, state, undefined).holds,
    ).toBe(true);
    const miss = evaluateAssertion(
      { element: { role: 'heading', name: 'Returns' } },
      state,
      undefined,
    );
    expect(miss.holds).toBe(false);
    expect(miss.observed).toBe('no heading named "Returns"');
  });
  it('requires the role to match exactly', () => {
    expect(
      evaluateAssertion({ element: { role: 'button', name: 'Contact us' } }, state, undefined)
        .holds,
    ).toBe(false);
  });
  it('state: checked requires a checked match', () => {
    expect(
      evaluateAssertion(
        { element: { role: 'checkbox', name: 'signed in', state: 'checked' } },
        state,
        undefined,
      ).holds,
    ).toBe(true);
    expect(
      evaluateAssertion(
        { element: { role: 'checkbox', name: 'Newsletter', state: 'checked' } },
        state,
        undefined,
      ).holds,
    ).toBe(false);
  });
  it('state: disabled requires a disabled match', () => {
    expect(
      evaluateAssertion(
        { element: { role: 'button', name: 'Place order', state: 'disabled' } },
        state,
        undefined,
      ).holds,
    ).toBe(true);
    expect(
      evaluateAssertion(
        { element: { role: 'button', name: 'Send message', state: 'disabled' } },
        state,
        undefined,
      ).holds,
    ).toBe(false);
  });
  it('state: visible is satisfied by presence', () => {
    expect(
      evaluateAssertion({ element: { role: 'button', state: 'visible' } }, state, undefined).holds,
    ).toBe(true);
  });
  it('url narrows the match to elements whose url contains the fragment', () => {
    expect(
      evaluateAssertion({ element: { role: 'link', url: 'mailto:' } }, state, undefined).holds,
    ).toBe(true);
    expect(
      evaluateAssertion({ element: { role: 'link', url: 'tel:' } }, state, undefined).holds,
    ).toBe(false);
    expect(
      evaluateAssertion(
        { element: { role: 'link', name: 'privacy', url: 'privacy.html' } },
        state,
        undefined,
      ).holds,
    ).toBe(true);
  });
});

describe('evaluateAssertion: navigated', () => {
  it('holds when the final URL differs from the start URL', () => {
    expect(evaluateAssertion({ navigated: true }, state, undefined).holds).toBe(true);
  });
  it('does not hold when the agent never left the start page', () => {
    const same = { ...state, url: state.startUrl as string };
    expect(evaluateAssertion({ navigated: true }, same, undefined).holds).toBe(false);
  });
  it('ignores a trailing slash difference', () => {
    const same = { ...state, url: 'http://127.0.0.1:4311', startUrl: 'http://127.0.0.1:4311/' };
    expect(evaluateAssertion({ navigated: true }, same, undefined).holds).toBe(false);
  });
});

describe('evaluateAssertion: answer', () => {
  it('fails without an answer', () => {
    const r = evaluateAssertion({ answer: { must_include: ['x'] } }, state, undefined);
    expect(r.holds).toBe(false);
    expect(r.observed).toBe('no answer returned');
    expect(evaluateAssertion({ answer: {} }, state, '').holds).toBe(false);
  });
  it('must_include requires every fragment (normalised)', () => {
    const answer = 'You can reach us at HELLO@northwind.example or +1 555 010 0199';
    expect(
      evaluateAssertion(
        { answer: { must_include: ['hello@northwind.example', '555 010'] } },
        state,
        answer,
      ),
    ).toMatchObject({ holds: true, observed: `answer="${answer}"` });
    expect(
      evaluateAssertion(
        { answer: { must_include: ['hello@northwind.example', 'fax'] } },
        state,
        answer,
      ).holds,
    ).toBe(false);
  });
  it('exact_match compares normalised strings', () => {
    expect(
      evaluateAssertion({ answer: { exact_match: '30 Days' } }, state, ' 30  days ').holds,
    ).toBe(true);
    expect(
      evaluateAssertion({ answer: { exact_match: '30 days' } }, state, '30 days or so').holds,
    ).toBe(false);
  });
  it('truncates long answers in observed', () => {
    const r = evaluateAssertion({ answer: {} }, state, 'a'.repeat(500));
    expect(r.holds).toBe(true);
    expect(r.observed).toBe(`answer="${'a'.repeat(120)}"`);
  });
});

describe('evaluateAssertion: any_of', () => {
  it('holds when at least one alternative holds and joins observations', () => {
    const a: Assertion = {
      any_of: [{ url: { includes: 'returns' } }, { text: { includes: '30 days' } }],
    };
    const r = evaluateAssertion(a, state, undefined);
    expect(r.holds).toBe(true);
    expect(r.observed).toBe(`url=${state.url} | text found`);
  });
  it('fails when no alternative holds and with an empty list', () => {
    expect(
      evaluateAssertion(
        { any_of: [{ url: { includes: 'returns' } }, { title: { includes: 'Returns' } }] },
        state,
        undefined,
      ).holds,
    ).toBe(false);
    expect(evaluateAssertion({ any_of: [] }, state, undefined).holds).toBe(false);
  });
  it('nests', () => {
    const nested: Assertion = {
      any_of: [{ any_of: [{ element: { role: 'heading', name: 'Contact' } }] }],
    };
    expect(evaluateAssertion(nested, state, undefined).holds).toBe(true);
  });
});

describe('evaluateAssertion: unknown shapes', () => {
  it('never throws and reports an unknown assertion', () => {
    const r = evaluateAssertion({ bogus: 1 } as unknown as Assertion, state, undefined);
    expect(r.holds).toBe(false);
    expect(r.observed).toBe('unknown assertion');
  });
});

describe('evaluateAll', () => {
  it('evaluates every assertion in order and keeps the assertion object', () => {
    const list: Assertion[] = [
      { url: { includes: 'contact' } },
      { text: { includes: 'missing' } },
      { answer: { must_include: ['30'] } },
    ];
    const rs = evaluateAll(list, state, '30 days');
    expect(rs.map((r) => r.holds)).toEqual([true, false, true]);
    expect(rs.map((r) => r.assertion)).toEqual(list);
  });
});
