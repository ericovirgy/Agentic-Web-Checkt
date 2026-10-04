import {
  DIMENSION_LABELS,
  DIMENSIONS,
  type CheckResult,
  type Dimension,
  type DimensionScore,
  type TaskResult,
} from '../types.js';

/** Dimension weights; see docs/SCORING.md §2. */
export const DIMENSION_WEIGHTS: Record<Exclude<Dimension, 'task-success'>, number> = {
  perception: 20,
  navigation: 15,
  interaction: 20,
  'machine-interfaces': 10,
  reliability: 15,
  safety: 20,
};
export const TASK_SUCCESS_WEIGHT = 30;

export function scoreDimension(dimension: Dimension, checks: CheckResult[]): DimensionScore {
  const mine = checks.filter((c) => c.dimension === dimension);
  const scorable = mine.filter(
    (c) =>
      c.score !== undefined && (c.status === 'pass' || c.status === 'warn' || c.status === 'fail'),
  );
  const wsum = scorable.reduce((a, c) => a + c.weight, 0);
  const ssum = scorable.reduce((a, c) => a + c.weight * (c.score ?? 0), 0);
  return {
    dimension,
    label: DIMENSION_LABELS[dimension],
    score: wsum === 0 ? null : Math.round((100 * ssum) / wsum),
    weight: dimension === 'task-success' ? TASK_SUCCESS_WEIGHT : DIMENSION_WEIGHTS[dimension],
    checks: mine.map((c) => c.id),
    passed: mine.filter((c) => c.status === 'pass').length,
    warned: mine.filter((c) => c.status === 'warn').length,
    failed: mine.filter((c) => c.status === 'fail').length,
  };
}

export function scoreTasks(tasks: TaskResult[]): DimensionScore {
  const counted = tasks.filter((t) => t.verdict !== 'INCONCLUSIVE');
  const passed = counted.filter((t) => t.verdict === 'PASS').length;
  return {
    dimension: 'task-success',
    label: DIMENSION_LABELS['task-success'],
    score: counted.length === 0 ? null : Math.round((100 * passed) / counted.length),
    weight: TASK_SUCCESS_WEIGHT,
    checks: tasks.map((t) => `task:${t.name}`),
    passed,
    warned: 0,
    failed: counted.length - passed,
  };
}

export function computeScores(
  checks: CheckResult[],
  tasks: TaskResult[],
): { overall: number | null; dimensions: DimensionScore[] } {
  const dims: DimensionScore[] = DIMENSIONS.filter((d) => d !== 'task-success').map((d) =>
    scoreDimension(d, checks),
  );
  const taskDim = scoreTasks(tasks);
  const withTasks = taskDim.score !== null;
  if (withTasks) {
    // Deterministic dimensions share 70%, task success takes 30% (docs/SCORING.md §2).
    for (const d of dims) d.weight = Math.round(d.weight * 0.7 * 100) / 100;
    dims.push(taskDim);
  } else {
    dims.push(taskDim);
  }
  const available = dims.filter((d) => d.score !== null);
  const wsum = available.reduce((a, d) => a + d.weight, 0);
  const overall =
    wsum === 0
      ? null
      : Math.round(available.reduce((a, d) => a + d.weight * (d.score ?? 0), 0) / wsum);
  return { overall, dimensions: dims };
}

export function suggestedFixes(
  checks: CheckResult[],
  max = 8,
): { checkId: string; title: string; remediation: string; weight: number }[] {
  const order: Record<string, number> = { fail: 0, warn: 1 };
  return checks
    .filter((c) => (c.status === 'fail' || c.status === 'warn') && c.remediation)
    .sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || b.weight - a.weight)
    .slice(0, max)
    .map((c) => ({
      checkId: c.id,
      title: c.title,
      remediation: c.remediation ?? '',
      weight: c.weight,
    }));
}
