import { describe, expect, it } from 'vitest';
import {
  computeScores,
  DIMENSION_WEIGHTS,
  scoreDimension,
  scoreTasks,
  suggestedFixes,
  TASK_SUCCESS_WEIGHT,
} from '../../src/scoring/index.js';
import { DIMENSIONS } from '../../src/types.js';
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
    const { dimensions } = computeScores(allPass, [
      makeTask({ name: 'a', verdict: 'INCONCLUSIVE' }),
    ]);
    const perception = dimensions.find((d) => d.dimension === 'perception');
    expect(perception?.weight).toBe(DIMENSION_WEIGHTS.perception);
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
