import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  DEFAULT_TASKS,
  loadTasksFile,
  parseAssertion,
  parseTaskDefinition,
  resolveTasks,
} from '../../src/tasks/archetypes.js';
import { fixtureSites, fixtureTasks, loadFixture, makeTmpDir } from '../helpers.js';

const tmp = makeTmpDir('awc-archetypes-');
afterAll(() => tmp.cleanup());

describe('parseAssertion', () => {
  it('accepts canonical assertion objects', () => {
    expect(parseAssertion({ url: { includes: 'contact' } }, 't')).toEqual({
      url: { includes: 'contact' },
    });
    expect(parseAssertion({ text: { includes: '30 days' } }, 't')).toEqual({
      text: { includes: '30 days' },
    });
    expect(parseAssertion({ element: { role: 'heading', name: 'Privacy' } }, 't')).toEqual({
      element: { role: 'heading', name: 'Privacy' },
    });
    expect(parseAssertion({ answer: { must_include: ['x'] } }, 't')).toEqual({
      answer: { must_include: ['x'] },
    });
  });

  it('accepts the fixture shorthand { type, ...fields }', () => {
    expect(parseAssertion({ type: 'url', includes: 'contact.html' }, 't')).toEqual({
      url: { includes: 'contact.html' },
    });
    expect(parseAssertion({ type: 'element', role: 'heading', name: 'Order form' }, 't')).toEqual({
      element: { role: 'heading', name: 'Order form' },
    });
    expect(parseAssertion({ type: 'answer', must_include: ['30 days'] }, 't')).toEqual({
      answer: { must_include: ['30 days'] },
    });
    expect(parseAssertion({ type: 'title', includes: 'Trail' }, 't')).toEqual({
      title: { includes: 'Trail' },
    });
  });

  it('normalises navigated to { navigated: true } in both forms', () => {
    expect(parseAssertion({ navigated: true }, 't')).toEqual({ navigated: true });
    expect(parseAssertion({ navigated: 'yes' }, 't')).toEqual({ navigated: true });
    expect(parseAssertion({ type: 'navigated' }, 't')).toEqual({ navigated: true });
  });

  it('parses any_of recursively in both forms', () => {
    const canonical = parseAssertion(
      { any_of: [{ url: { regex: 'contact' } }, { type: 'text', includes: '@' }] },
      't',
    );
    expect(canonical).toEqual({
      any_of: [{ url: { regex: 'contact' } }, { text: { includes: '@' } }],
    });
    const shorthand = parseAssertion(
      { type: 'any_of', any_of: [{ type: 'url', includes: 'a' }, { navigated: true }] },
      't',
    );
    expect(shorthand).toEqual({ any_of: [{ url: { includes: 'a' } }, { navigated: true }] });
    expect(parseAssertion({ any_of: undefined }, 't')).toEqual({ any_of: [] });
  });

  it('rejects non-objects', () => {
    expect(() => parseAssertion(null, 'p')).toThrow(/^p: assertion must be an object/);
    expect(() => parseAssertion('url', 'p')).toThrow(/assertion must be an object/);
    expect(() => parseAssertion(42, 'p')).toThrow(/assertion must be an object/);
  });

  it('rejects objects with zero or several assertion keys', () => {
    expect(() => parseAssertion({}, 'p')).toThrow(/exactly one of url, text, title/);
    expect(() => parseAssertion({ foo: 1 }, 'p')).toThrow(/exactly one of/);
    expect(() => parseAssertion({ url: { includes: 'a' }, text: { includes: 'b' } }, 'p')).toThrow(
      /exactly one of/,
    );
  });

  it('rejects non-object assertion values and reports the path', () => {
    expect(() => parseAssertion({ url: 'contact' }, 'task (x).success[0]')).toThrow(
      'task (x).success[0].url: must be an object',
    );
    expect(() => parseAssertion({ text: null }, 'p')).toThrow(/p\.text: must be an object/);
  });

  it('reports nested any_of paths on error', () => {
    expect(() => parseAssertion({ any_of: [{ url: { includes: 'a' } }, 'bad'] }, 'p')).toThrow(
      /^p\.any_of\[1\]: assertion must be an object/,
    );
  });
});

describe('parseTaskDefinition', () => {
  const raw = {
    name: 'find-contact-email',
    goal: 'Find the email address.',
    safety: 'read-only',
    expect: 'PASS',
    success: [
      { type: 'url', includes: 'contact.html' },
      { type: 'answer', must_include: ['hello@northwind.example'] },
    ],
    data: { query: 'trail', count: 3 },
    hints: ['contact', 42],
    max_steps: 7,
    start: '/contact.html',
  };

  it('parses a fixture-style task, stringifying data and hints', () => {
    const t = parseTaskDefinition(raw);
    expect(t).toEqual({
      name: 'find-contact-email',
      goal: 'Find the email address.',
      start: '/contact.html',
      success: [
        { url: { includes: 'contact.html' } },
        { answer: { must_include: ['hello@northwind.example'] } },
      ],
      safety: 'read-only',
      max_steps: 7,
      hints: ['contact', '42'],
      data: { query: 'trail', count: '3' },
    });
    // the fixture-only `expect` field is not carried over
    expect('expect' in t).toBe(false);
  });

  it('defaults safety to read-only and leaves optional fields undefined', () => {
    const t = parseTaskDefinition({ name: 'n', goal: 'g', success: [{ navigated: true }] });
    expect(t.safety).toBe('read-only');
    expect(t.start).toBeUndefined();
    expect(t.max_steps).toBeUndefined();
    expect(t.hints).toBeUndefined();
    expect(t.data).toBeUndefined();
  });

  it('accepts "assert" as an alias of "success"', () => {
    const t = parseTaskDefinition({ name: 'n', goal: 'g', assert: [{ text: { includes: 'x' } }] });
    expect(t.success).toEqual([{ text: { includes: 'x' } }]);
  });

  it('rejects missing or invalid fields with path and task name', () => {
    expect(() => parseTaskDefinition(null)).toThrow(/^task: must be an object/);
    expect(() => parseTaskDefinition({ goal: 'g', success: [{}] }, 'tasks[0]')).toThrow(
      /^tasks\[0\]: name is required/,
    );
    expect(() => parseTaskDefinition({ name: '', goal: 'g' })).toThrow(/name is required/);
    expect(() => parseTaskDefinition({ name: 'n', success: [{ navigated: true }] })).toThrow(
      /^task \(n\): goal is required/,
    );
    expect(() => parseTaskDefinition({ name: 'n', goal: 'g' })).toThrow(
      /success must be a non-empty list/,
    );
    expect(() => parseTaskDefinition({ name: 'n', goal: 'g', success: [] })).toThrow(
      /success must be a non-empty list/,
    );
    expect(() => parseTaskDefinition({ name: 'n', goal: 'g', success: 'x' })).toThrow(
      /success must be a non-empty list/,
    );
    expect(() =>
      parseTaskDefinition({ name: 'n', goal: 'g', success: [{ navigated: true }], safety: 'yolo' }),
    ).toThrow(/safety must be read-only, form-submit or consequential/);
    expect(() =>
      parseTaskDefinition({ name: 'n', goal: 'g', success: [{ url: 'bad' }] }, 'f.yaml tasks[2]'),
    ).toThrow('f.yaml tasks[2] (n).success[0].url: must be an object');
  });

  it('accepts all three safety levels', () => {
    for (const safety of ['read-only', 'form-submit', 'consequential'] as const)
      expect(
        parseTaskDefinition({ name: 'n', goal: 'g', success: [{ navigated: true }], safety })
          .safety,
      ).toBe(safety);
  });
});

describe('loadTasksFile', () => {
  it('loads a YAML document with a top-level tasks list', () => {
    const file = join(tmp.path, 'tasks.yaml');
    writeFileSync(
      file,
      [
        'tasks:',
        '  - name: contact',
        '    goal: Find the contact page',
        '    safety: read-only',
        '    hints: [contact, "get in touch"]',
        '    success:',
        '      - url: { includes: contact }',
        '      - any_of:',
        '          - text: { includes: "@" }',
        '          - element: { role: link, name: mailto }',
        '  - name: order',
        '    goal: Place an order',
        '    safety: form-submit',
        '    data: { name: Alex, qty: 2 }',
        '    success:',
        '      - type: text',
        '        includes: Thank you',
        '',
      ].join('\n'),
    );
    const tasks = loadTasksFile(file);
    expect(tasks).toHaveLength(2);
    expect(tasks[0]).toMatchObject({
      name: 'contact',
      hints: ['contact', 'get in touch'],
      success: [
        { url: { includes: 'contact' } },
        { any_of: [{ text: { includes: '@' } }, { element: { role: 'link', name: 'mailto' } }] },
      ],
    });
    expect(tasks[1]).toMatchObject({
      name: 'order',
      safety: 'form-submit',
      data: { name: 'Alex', qty: '2' },
      success: [{ text: { includes: 'Thank you' } }],
    });
  });

  it('accepts a bare top-level list', () => {
    const file = join(tmp.path, 'list.yaml');
    writeFileSync(file, '- name: a\n  goal: b\n  success:\n    - navigated: true\n');
    expect(loadTasksFile(file)).toEqual([
      {
        name: 'a',
        goal: 'b',
        start: undefined,
        success: [{ navigated: true }],
        safety: 'read-only',
        max_steps: undefined,
        hints: undefined,
        data: undefined,
      },
    ]);
  });

  it('rejects documents without a list and reports the file and index on bad tasks', () => {
    const noList = join(tmp.path, 'nolist.yaml');
    writeFileSync(noList, 'name: a\ngoal: b\n');
    expect(() => loadTasksFile(noList)).toThrow(`${noList}: expected a top-level "tasks:" list`);

    const badTask = join(tmp.path, 'bad.yaml');
    writeFileSync(
      badTask,
      'tasks:\n  - name: ok\n    goal: g\n    success: [navigated: true]\n  - name: nogoal\n',
    );
    expect(() => loadTasksFile(badTask)).toThrow(`${badTask} tasks[1] (nogoal): goal is required`);
  });

  it('throws for a missing file', () => {
    expect(() => loadTasksFile(join(tmp.path, 'missing.yaml'))).toThrow(/ENOENT/);
  });
});

describe('DEFAULT_TASKS', () => {
  it('are valid task definitions that survive a parse round-trip', () => {
    expect(DEFAULT_TASKS.length).toBeGreaterThanOrEqual(3);
    for (const t of DEFAULT_TASKS) {
      const parsed = parseTaskDefinition(t, `default (${t.name})`);
      expect(parsed.name).toBe(t.name);
      expect(parsed.goal).toBe(t.goal);
      expect(parsed.success).toEqual(t.success);
      expect(parsed.safety).toBe('read-only');
      expect(parsed.hints?.length ?? 0).toBeGreaterThan(0);
      expect(parsed.max_steps).toBeGreaterThan(0);
    }
  });

  it('have unique names and read-only safety', () => {
    const names = DEFAULT_TASKS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain('contact');
    expect(DEFAULT_TASKS.every((t) => t.safety === 'read-only')).toBe(true);
  });
});

describe('resolveTasks', () => {
  it('returns [] for no spec, the built-ins for "default" and loads a file otherwise', () => {
    expect(resolveTasks(undefined)).toEqual([]);
    expect(resolveTasks('')).toEqual([]);
    expect(resolveTasks('default')).toBe(DEFAULT_TASKS);
    const file = join(tmp.path, 'resolve.yaml');
    writeFileSync(
      file,
      'tasks:\n  - name: a\n    goal: b\n    success:\n      - navigated: true\n',
    );
    expect(resolveTasks(file)).toHaveLength(1);
    expect(() => resolveTasks(join(tmp.path, 'nope.yaml'))).toThrow();
  });
});

describe('fixture task definitions', () => {
  it('every fixture.json task parses and declares an expected verdict', () => {
    const sites = fixtureSites();
    expect(sites.length).toBeGreaterThanOrEqual(8);
    for (const site of sites) {
      const fx = loadFixture(site);
      expect(fx.name).toBe(site);
      const tasks = fixtureTasks(fx);
      expect(tasks).toHaveLength(fx.tasks.length);
      for (const t of fx.tasks)
        expect(['PASS', 'FAIL', 'BLOCKED', 'INCONCLUSIVE']).toContain(t.expect);
      for (const status of Object.values(fx.expect))
        expect(['pass', 'warn', 'fail', 'na', 'info']).toContain(status);
    }
  });
});
