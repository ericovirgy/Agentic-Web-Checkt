/**
 * Baseline agent: deterministic, LLM-free. It navigates by accessible-name matching against the
 * task keywords and stops when the success assertions hold. It represents the weakest reasonable
 * agent; when it fails, the step log shows which perception gap stopped it.
 */
import { interactiveNodes } from '../browser/snapshot.js';
import type { TaskDefinition } from '../types.js';
import { type PageState, capturePageState, evaluateAll, normaliseText } from './assertions.js';
import { keywordsFromGoal, matchScore } from './keywords.js';
import { BlockedError, type BrowserTools } from './tools.js';

export interface AgentOutcome {
  status: 'done' | 'gave_up' | 'blocked' | 'error';
  reason: string;
  answer?: string;
  blocker?: BlockedError;
}

export interface AgentRunOptions {
  maxSteps: number;
  deadlineMs: number;
  log: (m: string) => void;
}

async function answerFromPage(tools: BrowserTools): Promise<string> {
  return tools.page
    .evaluate(() => {
      const main = document.querySelector('main,[role=main]') ?? document.body;
      return (main as HTMLElement).innerText.replace(/\s+/g, ' ').trim().slice(0, 2000);
    })
    .catch(() => '');
}

export async function runBaselineAgent(
  tools: BrowserTools,
  task: TaskDefinition,
  opts: AgentRunOptions,
): Promise<AgentOutcome> {
  const keywords = keywordsFromGoal(task.goal, task.hints);
  const query = task.data?.query ?? task.data?.search;
  const visitedUrls = new Set<string>();
  const clickedRefs = new Set<string>();
  const stateHashes: string[] = [];
  let scrolled = 0;
  let dismissed = false;
  const started = Date.now();

  const satisfied = async (): Promise<{ ok: boolean; state: PageState; answer: string }> => {
    const state = await capturePageState(tools.page);
    const answer = task.success.some((a) => 'answer' in a) ? await answerFromPage(tools) : '';
    const results = evaluateAll(task.success, state, answer);
    return { ok: results.length > 0 && results.every((r) => r.holds), state, answer };
  };

  for (let step = 0; step < opts.maxSteps; step++) {
    if (Date.now() - started > opts.deadlineMs)
      return { status: 'gave_up', reason: 'wall-clock budget exhausted' };
    const snap = await tools.takeSnapshot();
    const blocker = await tools.detectBlocker();
    if (blocker)
      return {
        status: 'blocked',
        reason: `${blocker.kind}: ${blocker.detail}`,
        blocker: new BlockedError(blocker.kind, blocker.detail),
      };

    const { ok, state, answer } = await satisfied();
    if (ok)
      return {
        status: 'done',
        reason: `success criteria satisfied after ${tools.steps.length} actions`,
        answer: answer || undefined,
      };
    visitedUrls.add(normaliseText(state.url));

    const hash = `${state.url}|${snap.text.length}|${snap.text.slice(0, 400)}`;
    stateHashes.push(hash);
    if (stateHashes.filter((h) => h === hash).length >= 3)
      return { status: 'gave_up', reason: 'page state repeated three times (loop)' };

    // 1. Overlay in the way? Try a named dismiss control once.
    if (!dismissed) {
      const dialog = snap.nodes.find(
        (n) => (n.role === 'dialog' || n.role === 'alertdialog') && n.ref,
      );
      if (dialog) {
        dismissed = true;
        if (await tools.tryDismissOverlay()) continue;
      }
    }

    // 2. Search box with a query?
    if (query) {
      const box = interactiveNodes(snap).find(
        (n) =>
          (n.role === 'searchbox' ||
            (n.role === 'textbox' && /search|pesquis|procurar|find/i.test(n.name))) &&
          n.ref &&
          !clickedRefs.has(n.ref),
      );
      if (box?.ref) {
        clickedRefs.add(box.ref);
        try {
          await tools.type(box.ref, query, true);
        } catch (e) {
          if (e instanceof BlockedError)
            return { status: 'blocked', reason: e.message, blocker: e };
          opts.log(`baseline: typing failed: ${String(e)}`);
        }
        continue;
      }
    }

    // 3. Best unvisited link/button by accessible-name match.
    const candidates = interactiveNodes(snap)
      .filter(
        (n) =>
          (n.role === 'link' || n.role === 'button' || n.role === 'menuitem' || n.role === 'tab') &&
          n.ref &&
          n.name &&
          !clickedRefs.has(n.ref),
      )
      .map((n) => {
        let abs = '';
        try {
          abs = n.url ? new URL(n.url, state.url).toString() : '';
        } catch {}
        const visited = abs ? visitedUrls.has(normaliseText(abs)) : false;
        return { n, abs, score: visited ? 0 : matchScore(n.name, n.url, keywords) };
      })
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score);
    const best = candidates[0];
    if (best?.n.ref) {
      clickedRefs.add(best.n.ref);
      try {
        await tools.click(best.n.ref);
      } catch (e) {
        if (e instanceof BlockedError) return { status: 'blocked', reason: e.message, blocker: e };
        opts.log(
          `baseline: click failed on ${best.n.ref}: ${String((e as Error).message).split('\n')[0]}`,
        );
      }
      continue;
    }

    // 4. Nothing matched: scroll once to reveal more, then give up.
    if (scrolled < 2) {
      scrolled++;
      await tools.scroll('down').catch(() => {});
      continue;
    }
    return {
      status: 'gave_up',
      reason: `no control matched keywords [${keywords.slice(0, 8).join(', ')}] on ${state.url}`,
    };
  }
  return { status: 'gave_up', reason: `step budget (${opts.maxSteps}) exhausted` };
}
