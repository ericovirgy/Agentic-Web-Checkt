/**
 * End-to-end scan of every fixture site. Each site is scanned once (beforeAll) with the baseline
 * agent and the fixture's own tasks; the tests then compare check statuses and task verdicts with
 * the `expect` blocks in fixture.json and validate the JSON shape of the result.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type FixtureServer, startFixtureServer } from '../../fixtures/server.js';
import { scan } from '../../src/scanner.js';
import { DIMENSIONS, type ScanResult } from '../../src/types.js';
import { BROWSER_PATH, fixtureSites, fixtureTasks, loadFixture } from '../helpers.js';

const SCAN_TIMEOUT_MS = 180_000;

for (const site of fixtureSites()) {
  const fixture = loadFixture(site);

  describe(`fixture: ${site}`, { sequential: true }, () => {
    let server: FixtureServer;
    let result: ScanResult;

    beforeAll(async () => {
      server = await startFixtureServer(site);
      result = await scan({
        url: server.url,
        pages: fixture.scanPages ?? 8,
        tasks: fixtureTasks(fixture),
        agent: 'baseline',
        browserPath: BROWSER_PATH,
      });
    }, SCAN_TIMEOUT_MS);

    afterAll(async () => {
      await server?.close();
    });

    it('produces a well-formed result', () => {
      expect(result.meta.tool).toBe('agentic-web-check');
      expect(result.meta.schema).toBe('1');
      expect(result.meta.methodology).toBe('1');
      expect(result.meta.url).toBe(server.url);
      expect(result.meta.mode).toBe(fixture.tasks.length ? 'behavioural' : 'deterministic');
      expect(result.meta.browser.name).toBe('chromium');
      expect(result.meta.browser.userAgent).toContain('AgenticWebCheck/');
      expect(result.meta.options).toMatchObject({
        pages: fixture.scanPages ?? 8,
        agent: 'baseline',
        tasks: fixture.tasks.length,
      });
      expect(Date.parse(result.meta.startedAt)).toBeLessThanOrEqual(
        Date.parse(result.meta.finishedAt),
      );
      expect(result.meta.durationMs).toBeGreaterThan(0);

      expect(typeof result.overall).toBe('number');
      expect(result.overall).toBeGreaterThanOrEqual(0);
      expect(result.overall).toBeLessThanOrEqual(100);

      expect(result.dimensions).toHaveLength(7);
      expect(result.dimensions.map((d) => d.dimension)).toEqual(DIMENSIONS);
      for (const d of result.dimensions) {
        if (d.score !== null) {
          expect(d.score).toBeGreaterThanOrEqual(0);
          expect(d.score).toBeLessThanOrEqual(100);
        }
        expect(d.weight).toBeGreaterThan(0);
      }

      expect(result.checks.length).toBeGreaterThanOrEqual(40);
      const ids = result.checks.map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const c of result.checks) {
        expect(['pass', 'warn', 'fail', 'na', 'info']).toContain(c.status);
        expect([1, 3, 7, 10]).toContain(c.weight);
        expect(DIMENSIONS).toContain(c.dimension);
        expect(typeof c.summary).toBe('string');
        expect(Array.isArray(c.evidence)).toBe(true);
        if (c.status === 'pass') expect(c.score).toBe(1);
        if (c.status === 'warn') expect(c.score).toBe(0.5);
        if (c.status === 'fail') expect(c.score).toBe(0);
        if (c.status === 'na' || c.status === 'info') expect(c.score).toBeUndefined();
      }

      expect(result.pages.length).toBeGreaterThanOrEqual(1);
      expect(result.pages[0]?.url).toBe(server.url);
      expect(result.pages[0]?.status).toBe(200);
      expect(result.pages.length).toBeLessThanOrEqual(fixture.scanPages ?? 8);

      expect(result.tasks).toHaveLength(fixture.tasks.length);
      expect(Array.isArray(result.suggestedFixes)).toBe(true);
      // the result must be JSON-serialisable without loss
      expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    });

    it('no check crashed', () => {
      const crashed = result.checks.filter((c) => c.error);
      expect(crashed.map((c) => `${c.id}: ${c.error}`)).toEqual([]);
    });

    for (const [checkId, status] of Object.entries(fixture.expect)) {
      it(`check ${checkId} is ${status}`, () => {
        const check = result.checks.find((c) => c.id === checkId);
        expect(check, `check ${checkId} missing from results`).toBeDefined();
        expect(
          check?.status,
          `${checkId}: expected ${status}, got ${check?.status} (${check?.summary})`,
        ).toBe(status);
      });
    }

    for (const task of fixture.tasks) {
      it(`task ${task.name} is ${task.expect}`, () => {
        const r = result.tasks.find((t) => t.name === task.name);
        expect(r, `task ${task.name} missing from results`).toBeDefined();
        expect(r?.verdict, `${task.name}: ${r?.reason}`).toBe(task.expect);
        expect(r?.agent).toBe('baseline');
        expect(r?.goal).toBe(task.goal);
        expect(r?.startUrl).toBe(server.url);
        expect(r?.durationMs).toBeGreaterThan(0);
        if (r?.verdict === 'BLOCKED') expect(r.blocker).toBeTruthy();
        if (r?.verdict === 'PASS') {
          expect(r.assertions.length).toBe(task.success.length);
          expect(r.assertions.every((a) => a.holds)).toBe(true);
        }
        if (r?.verdict === 'FAIL')
          expect(r.assertions.some((a) => !a.holds) || r.steps.length > 0).toBe(true);
      });
    }
  });
}
