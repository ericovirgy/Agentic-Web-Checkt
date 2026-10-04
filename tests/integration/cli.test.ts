/**
 * The CLI, run as a child process through tsx, against the "excellent" fixture.
 */
import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type FixtureServer, startFixtureServer } from '../../fixtures/server.js';
import { ALL_CHECKS } from '../../src/checks/index.js';
import type { ScanResult } from '../../src/types.js';
import { makeTmpDir, ROOT, xmlProblem } from '../helpers.js';

const TSX = join(ROOT, 'node_modules', '.bin', 'tsx');
const CLI = join(ROOT, 'src', 'cli.ts');
const CLI_TIMEOUT_MS = 120_000;

interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runCli(args: string[]): Promise<CliResult> {
  return new Promise((resolve) => {
    execFile(
      TSX,
      [CLI, ...args],
      {
        cwd: ROOT,
        env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
        timeout: CLI_TIMEOUT_MS,
        maxBuffer: 16 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        const code =
          error && typeof (error as { code?: unknown }).code === 'number'
            ? ((error as { code: number }).code as number)
            : error
              ? 1
              : 0;
        resolve({ code, stdout: String(stdout), stderr: String(stderr) });
      },
    );
  });
}

describe('cli', { sequential: true }, () => {
  let server: FixtureServer;
  const tmp = makeTmpDir('awc-cli-');
  const jsonPath = join(tmp.path, 'scan.json');

  beforeAll(async () => {
    server = await startFixtureServer('excellent');
  });
  afterAll(async () => {
    await server?.close();
    tmp.cleanup();
  });

  it(
    'scan <url> --json <file> --no-color -q exits 0 and writes valid JSON',
    async () => {
      const r = await runCli([
        'scan',
        server.url,
        '--json',
        jsonPath,
        '--no-color',
        '-q',
        '-p',
        '2',
      ]);
      expect(r.code, r.stderr).toBe(0);
      expect(r.stderr.trim()).toBe('');
      expect(r.stdout).toContain('AGENTIC WEB CHECK');
      expect(r.stdout).toContain('Agent Readiness');
      expect(r.stdout).toContain('Deterministic scan (no tasks run)');
      expect(r.stdout).not.toMatch(/\u001b\[/);

      const json = JSON.parse(readFileSync(jsonPath, 'utf8')) as ScanResult;
      expect(json.meta.schema).toBe('1');
      expect(json.meta.methodology).toBe('1');
      expect(json.meta.url).toBe(server.url);
      expect(json.meta.mode).toBe('deterministic');
      expect(json.meta.options.pages).toBe(2);
      expect(json.dimensions).toHaveLength(7);
      expect(json.checks).toHaveLength(ALL_CHECKS.length);
      expect(typeof json.overall).toBe('number');
      expect(json.tasks).toEqual([]);
      expect(r.stdout).toContain(`${json.overall}/100`);
    },
    CLI_TIMEOUT_MS,
  );

  it(
    'ci <url> --fail-under 101 --out <dir> -q exits 1 and writes all artifacts',
    async () => {
      const out = join(tmp.path, 'ci-out');
      // 101 cannot be reached, so the threshold always trips (the fixture may legitimately score 100).
      const r = await runCli([
        'ci',
        server.url,
        '--fail-under',
        '101',
        '--out',
        out,
        '-q',
        '-p',
        '2',
      ]);
      expect(r.code, r.stdout).toBe(1);
      expect(r.stdout).toContain('CI threshold not met');
      expect(r.stdout).toMatch(/overall score \d+ is below 101/);

      for (const f of ['results.json', 'report.html', 'summary.md', 'badge.svg'])
        expect(existsSync(join(out, f)), `${f} missing`).toBe(true);

      const json = JSON.parse(readFileSync(join(out, 'results.json'), 'utf8')) as ScanResult;
      expect(json.meta.url).toBe(server.url);
      expect(typeof json.overall).toBe('number');

      const html = readFileSync(join(out, 'report.html'), 'utf8');
      expect(html.startsWith('<!doctype html>')).toBe(true);
      expect(html).toContain('Agentic Web Check report');
      expect(html).not.toMatch(/<script\s+src/i);

      const md = readFileSync(join(out, 'summary.md'), 'utf8');
      expect(md.startsWith(`## Agentic Web Check: ${json.overall}/100`)).toBe(true);
      expect(md).toContain('| Dimension | Score | Pass | Warn | Fail |');

      const svg = readFileSync(join(out, 'badge.svg'), 'utf8');
      expect(xmlProblem(svg)).toBeNull();
      expect(svg).toContain('Agent Ready · scan');
      expect(svg).toContain(`${json.overall}/100`);
    },
    CLI_TIMEOUT_MS,
  );

  it('report <results.json> --no-color prints the score from the file', async () => {
    const json = JSON.parse(readFileSync(jsonPath, 'utf8')) as ScanResult;
    const r = await runCli(['report', jsonPath, '--no-color']);
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toContain('AGENTIC WEB CHECK');
    expect(r.stdout).toMatch(new RegExp(`Agent Readiness\\s+${json.overall}/100`));
    expect(r.stdout).toContain(json.meta.url);
    expect(r.stdout).not.toMatch(/\u001b\[/);
  });

  it('report can re-render artifacts without a browser', async () => {
    const html = join(tmp.path, 'rerender.html');
    const badge = join(tmp.path, 'rerender.svg');
    const r = await runCli(['report', jsonPath, '--html', html, '--badge', badge, '--no-color']);
    expect(r.code, r.stderr).toBe(0);
    expect(readFileSync(html, 'utf8')).toContain('<!doctype html>');
    expect(xmlProblem(readFileSync(badge, 'utf8'))).toBeNull();
  });

  it('checks lists every check id with dimension and weight', async () => {
    const r = await runCli(['checks']);
    expect(r.code, r.stderr).toBe(0);
    const lines = r.stdout.trim().split('\n');
    expect(lines).toHaveLength(43);
    expect(ALL_CHECKS).toHaveLength(43);
    const ids = lines.map((l) => l.split(/\s+/)[0]);
    expect(ids).toEqual(ALL_CHECKS.map((c) => c.id));
    for (const line of lines) expect(line).toMatch(/^\S+\s+\S+\s+w\s?(1|3|7|10)\s{2}.+$/);
  });

  it('an unknown command exits non-zero with an error', async () => {
    const r = await runCli(['bogus']);
    expect(r.code).not.toBe(0);
    expect(r.stderr).toMatch(/unknown command 'bogus'/);
  });

  it('a missing results file for report exits 2 with an error message', async () => {
    const r = await runCli(['report', join(tmp.path, 'missing.json'), '--no-color']);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/error:/);
  });

  it('--version prints the package version', async () => {
    const r = await runCli(['--version']);
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string };
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe(pkg.version);
  });
});
