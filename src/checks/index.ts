import type { CheckDefinition } from './framework.js';
import { interactionChecks } from './interaction.js';
import { machineChecks } from './machine.js';
import { navigationChecks } from './navigation.js';
import { perceptionChecks } from './perception.js';
import { reliabilityChecks } from './reliability.js';
import { safetyChecks } from './safety.js';

export const ALL_CHECKS: CheckDefinition[] = [
  ...reliabilityChecks,
  ...perceptionChecks,
  ...navigationChecks,
  ...interactionChecks,
  ...machineChecks,
  ...safetyChecks,
];

export { runChecks } from './framework.js';
export type { CheckContext, CheckDefinition, CheckOutcome } from './framework.js';
