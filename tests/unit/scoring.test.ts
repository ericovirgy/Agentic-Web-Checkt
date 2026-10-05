import { describe, expect, it } from 'vitest';
import {
  type CheckContext,
  type CheckDefinition,
  runChecks,
  startPageFailure,
} from '../../src/checks/framework.js';
import {
  computeScores,
  DIMENSION_WEIGHTS,
  isConsequentialOptOut,
  isCountedTask,
  scoreDimension,
  scoreTasks,
  suggestedFixes,
  summarizeTaskOutcomes,
  TASK_SUCCESS_WEIGHT,
  taskOutcomeLine,
} from '../../src/scoring/index.js';
import { type CheckStatus, DIMENSIONS, type Dimension, type TaskVerdict } from '../../src/types.js';
import { makeCheck, makeTask } from '../helpers.js';

describe('scoreDimension', () => {
  it('weights pass/warn/fail by check weight and rounds to an integer', () => {
    const checks = [
      makeCheck({ id: 'a', dimension: 'perception', weight: 10, status: 'pass' }),
      makeCheck({ id: 'b', dimension: 'perception', weight: 3, status: 'fail' }),
    ];
    const d = scoreDimension('perception', checks);
    // 100 * 10 / 13 = 76.92 -> 77
    expect(d.score).toBe(77);
    expect(d.label).toBe('PERCEPTION');
    expect(d.weight).toBe(DIMENSION_WEIGHTS.perception);
    expect(d.checks).toEqual(['a', 'b']);
    expect(d.passed).toBe(1);
    expect(d.warned).toBe(0);
    expect(d.failed).toBe(1);
  });

  it('scores warn as 0.5', () => {
    const checks = [
      makeCheck({ id: 'a', dimension: 'safety', weight: 7, status: 'warn' }),
      makeCheck({ id: 'b', dimension: 'safety', weight: 7, status: 'pass' }),
    ];
    const d = scoreDimension('safety', checks);
    // (7*0.5 + 7*1) / 14 = 0.75
    expect(d.score).toBe(75);
    expect(d.warned).toBe(1);
  });

  it('excludes na and info checks from the score but lists them in checks', () => {
    const checks = [
      makeCheck({ id: 'a', dimension: 'navigation', weight: 10, status: 'fail' }),
      makeCheck({ id: 'b', dimension: 'navigation', weight: 10, status: 'na' }),
      makeCheck({ id: 'c', dimension: 'navigation', weight: 10, status: 'info' }),
    ];
    const d = scoreDimension('navigation', checks);
    expect(d.score).toBe(0);
    expect(d.checks).toEqual(['a', 'b', 'c']);
    expect(d.passed + d.warned + d.failed).toBe(1);
  });

  it('ignores checks that carry a status but no score', () => {
    const checks = [
      makeCheck({ id: 'a', dimension: 'navigation', weight: 10, status: 'pass' }),
      makeCheck({ id: 'b', dimension: 'navigation', weight: 10, status: 'fail', score: undefined }),
    ];
    expect(scoreDimension('navigation', checks).score).toBe(100);
  });

  it('returns null when no scorable checks exist', () => {
    const d = scoreDimension('interaction', [
      makeCheck({ id: 'x', dimension: 'interaction', status: 'na' }),
      makeCheck({ id: 'y', dimension: 'perception', status: 'pass' }),
    ]);
    expect(d.score).toBeNull();
    expect(d.checks).toEqual(['x']);
  });

  it('only counts checks of the requested dimension', () => {
    const checks = [
      makeCheck({ id: 'a', dimension: 'perception', weight: 10, status: 'fail' }),
      makeCheck({ id: 'b', dimension: 'reliability', weight: 10, status: 'pass' }),
    ];
    expect(scoreDimension('reliability', checks).score).toBe(100);
    expect(scoreDimension('perception', checks).score).toBe(0);
  });

  it('rounds half up like Math.round', () => {
    // weights 1 pass + 1 fail = 50 exactly; 3 pass + 1 fail + 1 warn => (3+0.5)/5 = 70
    expect(
      scoreDimension('safety', [
        makeCheck({ id: 'a', dimension: 'safety', weight: 1, status: 'pass' }),
        makeCheck({ id: 'b', dimension: 'safety', weight: 1, status: 'fail' }),
      ]).score,
    ).toBe(50);
    expect(
      scoreDimension('safety', [
        makeCheck({ id: 'a', dimension: 'safety', weight: 3, status: 'pass' }),
        makeCheck({ id: 'b', dimension: 'safety', weight: 1, status: 'fail' }),
        makeCheck({ id: 'c', dimension: 'safety', weight: 1, status: 'warn' }),
      ]).score,
    ).toBe(70);
  });
});

describe('scoreTasks', () => {
  it('counts PASS over PASS+FAIL+BLOCKED and excludes INCONCLUSIVE', () => {
    const d = scoreTasks([
      makeTask({ name: 'a', verdict: 'PASS' }),
      makeTask({ name: 'b', verdict: 'FAIL' }),
      makeTask({ name: 'c', verdict: 'BLOCKED' }),
      makeTask({ name: 'd', verdict: 'INCONCLUSIVE' }),
    ]);
    expect(d.score).toBe(33);
    expect(d.weight).toBe(TASK_SUCCESS_WEIGHT);
    expect(d.checks).toEqual(['task:a', 'task:b', 'task:c', 'task:d']);
    expect(d.passed).toBe(1);
    expect(d.failed).toBe(2);
    expect(d.warned).toBe(0);
  });

  it('is null with no tasks or only INCONCLUSIVE tasks', () => {
    expect(scoreTasks([]).score).toBeNull();
    expect(scoreTasks([makeTask({ name: 'a', verdict: 'INCONCLUSIVE' })]).score).toBeNull();
  });

  it('keeps BLOCKED tasks in the denominator (a blocked task is a task the agent could not finish)', () => {
    const blocked = (blocker: Parameters<typeof makeTask>[0]['blocker']) =>
      scoreTasks([
        makeTask({ name: 'ok', verdict: 'PASS' }),
        makeTask({ name: 'b', verdict: 'BLOCKED', blocker, safety: 'read-only' }),
      ]).score;
    for (const b of [
      'captcha',
      'bot-wall',
      'login-required',
      'consent-overlay',
      'http-error',
    ] as const)
      expect(blocked(b)).toBe(50);
  });

  it('excludes a consequential task BLOCKED only because --allow-consequential was not passed', () => {
    const optOut = makeTask({
      name: 'checkout',
      verdict: 'BLOCKED',
      blocker: 'consequential-step',
      safety: 'consequential',
    });
    expect(isConsequentialOptOut(optOut)).toBe(true);
    expect(isCountedTask(optOut)).toBe(false);
    const d = scoreTasks([makeTask({ name: 'ok', verdict: 'PASS' }), optOut]);
    expect(d.score).toBe(100);
    expect(d.failed).toBe(0);
    expect(d.checks).toEqual(['task:ok', 'task:checkout']);
    // Only such tasks => nothing counted, like all-INCONCLUSIVE.
    expect(scoreTasks([optOut]).score).toBeNull();
  });

  it('still counts a consequential-step block on read-only and form-submit tasks', () => {
    for (const safety of ['read-only', 'form-submit'] as const) {
      const t = makeTask({ name: 'x', verdict: 'BLOCKED', blocker: 'consequential-step', safety });
      expect(isConsequentialOptOut(t)).toBe(false);
      expect(isCountedTask(t)).toBe(true);
      expect(scoreTasks([makeTask({ name: 'ok', verdict: 'PASS' }), t]).score).toBe(50);
    }
    // A consequential task blocked by anything else (bot wall, login...) is a site defect.
    const wall = makeTask({
      name: 'y',
      verdict: 'BLOCKED',
      blocker: 'bot-wall',
      safety: 'consequential',
    });
    expect(isCountedTask(wall)).toBe(true);
    expect(scoreTasks([wall]).score).toBe(0);
  });
});

describe('summarizeTaskOutcomes / taskOutcomeLine', () => {
  it('is silent when every task passed or no task ran', () => {
    expect(taskOutcomeLine([])).toBeNull();
    expect(taskOutcomeLine([makeTask({ name: 'a' }), makeTask({ name: 'b' })])).toBeNull();
  });

  it('names every non-PASS verdict and what was not scored', () => {
    const tasks = [
      makeTask({ name: 'a', verdict: 'PASS' }),
      makeTask({ name: 'b', verdict: 'FAIL' }),
      makeTask({ name: 'c', verdict: 'BLOCKED', blocker: 'captcha' }),
      makeTask({ name: 'd', verdict: 'INCONCLUSIVE' }),
      makeTask({
        name: 'e',
        verdict: 'BLOCKED',
        blocker: 'consequential-step',
        safety: 'consequential',
      }),
    ];
    expect(summarizeTaskOutcomes(tasks)).toEqual({
      total: 5,
      counted: 3,
      passed: 1,
      failed: 1,
      blocked: 2,
      inconclusive: 1,
      excluded: 1,
    });
    expect(taskOutcomeLine(tasks)).toBe(
      '4 of 5 behavioural tasks did not pass (1 FAIL, 2 BLOCKED, 1 INCONCLUSIVE); INCONCLUSIVE not scored; 1 BLOCKED not scored: consequential task run without --allow-consequential',
    );
    expect(taskOutcomeLine([makeTask({ name: 'a', verdict: 'FAIL' })])).toBe(
      '1 of 1 behavioural task did not pass (1 FAIL)',
    );
  });
});

describe('computeScores', () => {
  const allPass = DIMENSIONS.filter((d) => d !== 'task-success').map((d, i) =>
    makeCheck({ id: `c${i}`, dimension: d, weight: 10, status: 'pass' }),
  );

  it('returns seven dimensions in canonical order, including an unscored task-success', () => {
    const { overall, dimensions } = computeScores(allPass, []);
    expect(dimensions.map((d) => d.dimension)).toEqual(DIMENSIONS);
    expect(dimensions).toHaveLength(7);
    expect(overall).toBe(100);
    const task = dimensions.find((d) => d.dimension === 'task-success');
    expect(task?.score).toBeNull();
    expect(task?.weight).toBe(TASK_SUCCESS_WEIGHT);
  });

  it('keeps the documented deterministic weights when no tasks are scored', () => {
    const { dimensions } = computeScores(allPass, []);
    for (const d of dimensions) {
      if (d.dimension === 'task-success') continue;
      expect(d.weight).toBe(DIMENSION_WEIGHTS[d.dimension as keyof typeof DIMENSION_WEIGHTS]);
    }
    expect(Object.values(DIMENSION_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('scales deterministic weights by 0.7 and blends task success at 30 when tasks ran', () => {
    const { overall, dimensions } = computeScores(allPass, [
      makeTask({ name: 'a', verdict: 'FAIL' }),
    ]);
    const det = dimensions.filter((d) => d.dimension !== 'task-success');
    for (const d of det)
      expect(d.weight).toBe(
        Math.round(DIMENSION_WEIGHTS[d.dimension as keyof typeof DIMENSION_WEIGHTS] * 70) / 100,
      );
    expect(det.reduce((a, d) => a + d.weight, 0)).toBeCloseTo(70, 5);
    const task = dimensions.find((d) => d.dimension === 'task-success');
    expect(task?.score).toBe(0);
    expect(task?.weight).toBe(30);
    // all deterministic dimensions 100, task success 0 => 70
    expect(overall).toBe(70);
  });

  it('gives 100 when everything passes and all tasks pass', () => {
    const { overall } = computeScores(allPass, [makeTask({ name: 'a', verdict: 'PASS' })]);
    expect(overall).toBe(100);
  });

  it('excludes null dimensions from the overall weighted mean', () => {
    const checks = [
      makeCheck({ id: 'p', dimension: 'perception', weight: 10, status: 'fail' }), // 0, weight 20
      makeCheck({ id: 's', dimension: 'safety', weight: 10, status: 'pass' }), // 100, weight 20
    ];
    const { overall, dimensions } = computeScores(checks, []);
    expect(dimensions.filter((d) => d.score !== null)).toHaveLength(2);
    expect(overall).toBe(50);
  });

  it('blends 70/30 using only the available deterministic dimensions', () => {
    const checks = [makeCheck({ id: 'p', dimension: 'perception', weight: 10, status: 'pass' })];
    const { overall } = computeScores(checks, [
      makeTask({ name: 'a', verdict: 'PASS' }),
      makeTask({ name: 'b', verdict: 'FAIL' }),
    ]);
    // perception 100 @ 14, tasks 50 @ 30 => (1400 + 1500) / 44 = 65.9 -> 66
    expect(overall).toBe(66);
  });

  it('rounds the overall score to an integer', () => {
    const checks = [
      makeCheck({ id: 'p', dimension: 'perception', weight: 10, status: 'fail' }), // 0 @ 20
      makeCheck({ id: 'n', dimension: 'navigation', weight: 10, status: 'pass' }), // 100 @ 15
      makeCheck({ id: 'r', dimension: 'reliability', weight: 10, status: 'pass' }), // 100 @ 15
    ];
    const { overall } = computeScores(checks, []);
    expect(overall).toBe(60);
    expect(Number.isInteger(overall)).toBe(true);
  });

  it('is null overall when nothing is scorable', () => {
    const { overall, dimensions } = computeScores(
      [makeCheck({ id: 'x', dimension: 'perception', status: 'na' })],
      [makeTask({ name: 'a', verdict: 'INCONCLUSIVE' })],
    );
    expect(overall).toBeNull();
    expect(dimensions.every((d) => d.score === null)).toBe(true);
  });

  it('treats INCONCLUSIVE-only task lists as a deterministic scan (weights unscaled)', () => {
    const { dimensions, overall } = computeScores(allPass, [
      makeTask({ name: 'a', verdict: 'INCONCLUSIVE' }),
    ]);
    const perception = dimensions.find((d) => d.dimension === 'perception');
    expect(perception?.weight).toBe(DIMENSION_WEIGHTS.perception);
    expect(dimensions.find((d) => d.dimension === 'task-success')?.score).toBeNull();
    expect(overall).toBe(100);
  });

  it('hides nothing: tasks all FAIL with static checks all passing gives 70, not 100', () => {
    const { overall, dimensions } = computeScores(allPass, [
      makeTask({ name: 'a', verdict: 'FAIL' }),
      makeTask({ name: 'b', verdict: 'BLOCKED', blocker: 'bot-wall' }),
    ]);
    expect(overall).toBe(70);
    expect(dimensions.find((d) => d.dimension === 'task-success')?.failed).toBe(2);
  });

  it('is 0 when the start page did not load (only RELIABILITY scorable, at 0)', () => {
    const checks = [
      makeCheck({ id: 'page-load', dimension: 'reliability', weight: 10, status: 'fail' }),
      makeCheck({
        id: 'challenge-or-bot-wall',
        dimension: 'reliability',
        weight: 10,
        status: 'na',
      }),
      ...DIMENSIONS.filter((d) => d !== 'task-success' && d !== 'reliability').map((d, i) =>
        makeCheck({ id: `gated${i}`, dimension: d, weight: 10, status: 'na' }),
      ),
    ];
    const { overall, dimensions } = computeScores(checks, []);
    expect(overall).toBe(0);
    expect(dimensions.filter((d) => d.score !== null).map((d) => d.dimension)).toEqual([
      'reliability',
    ]);
    // A challenged start page (403/429/503) also fails the bot-wall check: still 0.
    const challenged = checks.map((c) =>
      c.id === 'challenge-or-bot-wall' ? { ...c, status: 'fail' as const, score: 0 } : c,
    );
    expect(computeScores(challenged, []).overall).toBe(0);
    // Tasks cannot rescue it either: they are BLOCKED (http-error) and count as failures.
    expect(
      computeScores(checks, [makeTask({ name: 't', verdict: 'BLOCKED', blocker: 'http-error' })])
        .overall,
    ).toBe(0);
  });

  it('stays within 0..100 at the extremes and the scaled weights sum to 70 + 30', () => {
    const allFail = allPass.map((c) => ({ ...c, status: 'fail' as const, score: 0 }));
    expect(computeScores(allFail, []).overall).toBe(0);
    expect(computeScores(allFail, [makeTask({ name: 'a', verdict: 'FAIL' })]).overall).toBe(0);
    expect(computeScores(allPass, [makeTask({ name: 'a', verdict: 'PASS' })]).overall).toBe(100);
    const { dimensions } = computeScores(allPass, [makeTask({ name: 'a', verdict: 'PASS' })]);
    expect(dimensions.reduce((a, d) => a + d.weight, 0)).toBeCloseTo(100, 5);
    // Pseudo-random statuses: the rounded weighted mean never leaves 0..100.
    const statuses: CheckStatus[] = ['pass', 'warn', 'fail', 'na', 'info'];
    const verdicts: TaskVerdict[] = ['PASS', 'FAIL', 'BLOCKED', 'INCONCLUSIVE'];
    let seed = 7;
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    for (let round = 0; round < 200; round++) {
      const checks = DIMENSIONS.filter((d) => d !== 'task-success').flatMap((d) =>
        [10, 7, 3, 1].map((w, i) =>
          makeCheck({
            id: `${d}${i}`,
            dimension: d,
            weight: w as 10 | 7 | 3 | 1,
            status: statuses[rnd(statuses.length)],
          }),
        ),
      );
      const tasks = Array.from({ length: rnd(4) }, (_, i) =>
        makeTask({ name: `t${i}`, verdict: verdicts[rnd(verdicts.length)] }),
      );
      const { overall } = computeScores(checks, tasks);
      if (overall === null) continue;
      expect(Number.isInteger(overall)).toBe(true);
      expect(overall).toBeGreaterThanOrEqual(0);
      expect(overall).toBeLessThanOrEqual(100);
    }
  });

  it('documents the sensitivity of one weight-10 fail (docs/SCORING.md §2 table)', () => {
    // PERCEPTION catalogue weights: 10,7,7,3,3,3,3,3,3 (sum 42). One weight-10 fail costs 24 pts.
    const perception = [10, 7, 7, 3, 3, 3, 3, 3, 3].map((w, i) =>
      makeCheck({
        id: `p${i}`,
        dimension: 'perception',
        weight: w as 10 | 7 | 3,
        status: i === 0 ? 'fail' : 'pass',
      }),
    );
    expect(scoreDimension('perception', perception).score).toBe(76);
    const others = DIMENSIONS.filter((d) => d !== 'task-success' && d !== 'perception').map(
      (d, i) => makeCheck({ id: `o${i}`, dimension: d, weight: 10, status: 'pass' }),
    );
    // Without tasks: 100 - 24 * 0.20 = 95.2 -> 95. With tasks (all PASS): 100 - 24 * 0.14 -> 97.
    expect(computeScores([...perception, ...others], []).overall).toBe(95);
    expect(
      computeScores([...perception, ...others], [makeTask({ name: 'a', verdict: 'PASS' })]).overall,
    ).toBe(97);
    // A dimension with a single scorable check is 100 from one pass or 0 from one fail.
    const lone = (status: CheckStatus) =>
      scoreDimension('safety', [
        makeCheck({ id: 'hidden-instructions', dimension: 'safety', weight: 10, status }),
        makeCheck({ id: 'webmcp-tool-annotations', dimension: 'safety', weight: 3, status: 'na' }),
      ]);
    expect(lone('pass').score).toBe(100);
    expect(lone('fail').score).toBe(0);
    expect(lone('pass').passed + lone('pass').warned + lone('pass').failed).toBe(1);
    expect(lone('pass').checks).toHaveLength(2);
  });
});

describe('start-page gate (runChecks)', () => {
  const def = (id: string, dimension: Dimension = 'perception'): CheckDefinition => ({
    id,
    title: id,
    dimension,
    weight: 10,
    rationale: '',
    references: [],
    remediation: '',
    run: () => ({ status: 'pass', summary: 'ran' }),
  });
  const ctxWith = (start: { error?: string; status: number | null }): CheckContext =>
    ({
      options: { url: 'http://127.0.0.1:1/' },
      pages: [],
      start,
      probes: {},
      userAgent: 'ua',
      log: () => {},
    }) as unknown as CheckContext;
  const defs = [
    def('page-load', 'reliability'),
    def('challenge-or-bot-wall', 'reliability'),
    def('landmarks', 'navigation'),
    def('robots-agent-access', 'machine-interfaces'),
  ];

  it('describes a navigation error or an HTTP 4xx/5xx start page as not loaded', () => {
    expect(startPageFailure({ error: 'net::ERR_CONNECTION_REFUSED', status: null })).toBe(
      'net::ERR_CONNECTION_REFUSED',
    );
    expect(startPageFailure({ status: 500 })).toBe('HTTP 500');
    expect(startPageFailure({ status: 404 })).toBe('HTTP 404');
    expect(startPageFailure({ status: 200 })).toBeNull();
    expect(startPageFailure({ status: 399 })).toBeNull();
    expect(startPageFailure({ status: null })).toBeNull();
  });

  it('marks every check except page-load and challenge-or-bot-wall na when the start page failed', async () => {
    for (const start of [{ error: 'boom', status: null }, { status: 503 }]) {
      const results = await runChecks(defs, ctxWith(start));
      expect(results.map((r) => [r.id, r.status])).toEqual([
        ['page-load', 'pass'],
        ['challenge-or-bot-wall', 'pass'],
        ['landmarks', 'na'],
        ['robots-agent-access', 'na'],
      ]);
      expect(results[2]?.summary).toContain('start page did not load');
      expect(results[2]?.score).toBeUndefined();
      expect(results[2]?.error).toBeUndefined();
    }
    const ok = await runChecks(defs, ctxWith({ status: 200 }));
    expect(ok.every((r) => r.status === 'pass')).toBe(true);
  });
});

describe('suggestedFixes', () => {
  const checks = [
    makeCheck({ id: 'warn-light', status: 'warn', weight: 1, remediation: 'w1' }),
    makeCheck({ id: 'fail-light', status: 'fail', weight: 3, remediation: 'f3' }),
    makeCheck({ id: 'pass-heavy', status: 'pass', weight: 10, remediation: 'ignored' }),
    makeCheck({ id: 'warn-heavy', status: 'warn', weight: 10, remediation: 'w10' }),
    makeCheck({ id: 'fail-heavy', status: 'fail', weight: 10, remediation: 'f10' }),
    makeCheck({ id: 'fail-no-remediation', status: 'fail', weight: 10, remediation: undefined }),
    makeCheck({ id: 'na-heavy', status: 'na', weight: 10, remediation: 'ignored' }),
  ];

  it('orders failures before warnings, then by descending weight', () => {
    expect(suggestedFixes(checks).map((f) => f.checkId)).toEqual([
      'fail-heavy',
      'fail-light',
      'warn-heavy',
      'warn-light',
    ]);
  });

  it('skips pass/na checks and checks without a remediation', () => {
    const ids = suggestedFixes(checks).map((f) => f.checkId);
    expect(ids).not.toContain('pass-heavy');
    expect(ids).not.toContain('na-heavy');
    expect(ids).not.toContain('fail-no-remediation');
  });

  it('carries title, remediation and weight and honours the max argument', () => {
    const fixes = suggestedFixes(checks, 2);
    expect(fixes).toHaveLength(2);
    expect(fixes[0]).toEqual({
      checkId: 'fail-heavy',
      title: 'Check fail-heavy',
      remediation: 'f10',
      weight: 10,
    });
  });

  it('defaults to at most eight fixes', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      makeCheck({ id: `f${i}`, status: 'fail', weight: 3, remediation: 'fix' }),
    );
    expect(suggestedFixes(many)).toHaveLength(8);
  });
});
