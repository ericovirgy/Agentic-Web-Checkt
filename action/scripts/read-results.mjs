// Reads results.json written by `agentic-web-check ci` and exports the action outputs.
// Usage: node read-results.mjs <output-dir> <exit-code>
// Never throws: a missing or unreadable results.json (runtime error, exit 2) still produces outputs.
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [outDirArg = 'awc-results', exitCodeArg = '2'] = process.argv.slice(2);
const outDir = resolve(outDirArg);
const exitCode = Number(exitCodeArg);
const resultsPath = join(outDir, 'results.json');

let score = '';
let mode = '';
if (existsSync(resultsPath)) {
  try {
    const result = JSON.parse(readFileSync(resultsPath, 'utf8'));
    if (typeof result.overall === 'number') score = String(result.overall);
    if (result.meta && typeof result.meta.mode === 'string') mode = result.meta.mode;
  } catch (err) {
    process.stderr.write(`::warning::Could not parse ${resultsPath}: ${err.message}\n`);
  }
} else {
  process.stderr.write(`::warning::${resultsPath} was not produced (exit code ${exitCodeArg}).\n`);
}

const outputs = {
  score,
  mode,
  'results-path': resultsPath,
  'report-path': join(outDir, 'report.html'),
  'badge-path': join(outDir, 'badge.svg'),
  passed: exitCode === 0 ? 'true' : 'false',
};

const lines = Object.entries(outputs).map(([k, v]) => `${k}=${v}`).join('\n');
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${lines}\n`);
process.stdout.write(`${lines}\n`);
