export { scan, pickPagesToScan, normaliseInputUrl } from './scanner.js';
export {
  computeScores,
  suggestedFixes,
  DIMENSION_WEIGHTS,
  TASK_SUCCESS_WEIGHT,
} from './scoring/index.js';
export { ALL_CHECKS } from './checks/index.js';
export {
  DEFAULT_TASKS,
  loadTasksFile,
  parseTaskDefinition,
  resolveTasks,
} from './tasks/archetypes.js';
export { evaluateAssertion, evaluateAll, normaliseText } from './tasks/assertions.js';
export { keywordsFromGoal, matchScore } from './tasks/keywords.js';
export { parseRobots, robotsAllows, textFromHtml } from './browser/probes.js';
export { buildSnapshot, interactiveNodes } from './browser/snapshot.js';
export { renderTerminal } from './report/terminal.js';
export { renderHtml } from './report/html.js';
export { renderMarkdownSummary } from './report/markdown.js';
export { renderBadgeSvg, badgeLabel } from './report/badge.js';
export * from './types.js';
