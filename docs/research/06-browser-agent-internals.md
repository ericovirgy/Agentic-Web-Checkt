# 06 - Browser agent internals: how leading agents perceive and act on pages

Date: 2026-10-04. Sources were read from raw GitHub files, shallow clones, npm tarballs and vendor docs.
Legend: **FACT (url)** = read in source/docs at that URL; **INFERENCE** = conclusion drawn from facts; **UNVERIFIED** = could not confirm (network-blocked or not found).

Versions observed on registries today (FACT, registry.npmjs.org / pypi.org): `playwright` 1.63.0, `@playwright/mcp` 0.0.83 (depends on `playwright` 1.64.0-alpha), `chrome-devtools-mcp` 1.10.1 (puppeteer 25.12.0), `agent-browser` 0.38.2, `@browserbasehq/stagehand` 4.1.0, `browser-use` (PyPI) 0.13.10, `ai` 7.0.127, `@ai-sdk/openai` 4.0.83, `@ai-sdk/anthropic` 4.0.71, `@ai-sdk/openai-compatible` 3.0.62, `ollama-ai-provider-v2` 4.0.1 (peer `ai ^7`), `@anthropic-ai/sdk` 0.131.0, `openai` 7.28.0.

---

## 1. microsoft/playwright-mcp (now a thin wrapper over playwright-core)

**FACT** (https://raw.githubusercontent.com/microsoft/playwright-mcp/main/index.js, `cli.js`): the repo only re-exports `require('playwright-core/lib/coreBundle').tools.createConnection` / `decorateMCPCommand`. The real implementation lives in `microsoft/playwright` under `packages/playwright-core/src/tools/` (`index.ts` exports `BrowserBackend`, `Tab`, `browserTools` from `./backend/...`).

### 1.1 Snapshot pipeline (exact APIs)

**FACT** (https://raw.githubusercontent.com/microsoft/playwright/main/packages/playwright-core/src/tools/backend/tab.ts, `captureSnapshot`):
```ts
const ariaSnapshot = root
  ? await root.ariaSnapshot({ mode: 'ai', depth, boxes })
  : await this.page.ariaSnapshot({ mode: 'ai', depth, boxes });
// or, when the client asked for JSON:
await this.page.ariaSnapshotJSON({ mode: 'ai', depth, boxes });
```
The response renderer puts the YAML into a `### Snapshot` section (`response.ts`), prefixed by tab header (title/url/console counts) and modal states (dialogs, file choosers).

**FACT** (same file, `targetLocators`): a tool `target` is treated as a ref when it matches `/^(f\d+)?e\d+$/`; refs resolve with `this.page.getByRef(param.target)` and fail with `Ref e12 not found in the current page snapshot. Try capturing new snapshot.`; anything else is parsed as a Playwright selector/locator string.

**FACT** `getByRef` is sugar for the `aria-ref` selector engine (https://raw.githubusercontent.com/microsoft/playwright/main/packages/playwright-core/src/client/page.ts):
```ts
getByRef(ref: string): Locator { return this.locator(`aria-ref=${ref}`); }
```

**FACT** How refs are generated (https://raw.githubusercontent.com/microsoft/playwright/main/packages/injected/src/ariaSnapshot.ts):
- `mode: 'ai'` => `{ visibility: 'ariaOrVisible', refs: 'interactable', includeGenericRole: true, renderActive, renderCursorPointer: true }`; `mode: 'default'` => `refs: 'none'` (no refs in normal snapshots).
- `computeAriaRef`: a ref is assigned only if `ariaNode.box.visible && ariaNode.receivesPointerEvents`; the ref is cached on the element (`element._ariaRef`) and reused across snapshots while role+name are unchanged; new refs come from a module-level counter `'e' + (++lastRef)`, prefixed by `refPrefix` (`'f' + frameSeq` inside child frames, so iframe refs look like `f1e5`).
- Links get `url`, textboxes get `placeholder`; iframes are emitted as `role: 'iframe'` nodes and their child snapshot is fetched recursively (`ariaSnapshotJSONForFrame` in `server/page.ts` uses selector `aria-ref=${ref} >> internal:control=enter-frame >> body,frameset`).

**FACT** Ref resolution (https://raw.githubusercontent.com/microsoft/playwright/release-1.63/packages/injected/src/injectedScript.ts and `server/frameSelectors.ts`):
```ts
// injected: refs resolve against the LAST explicit ariaSnapshot() taken in that frame
_createAriaRefEngine() {
  const queryAll = (root, selector) => {
    const result = this._lastAriaSnapshotForQuery?.info?.get(selector);
    return result && result.element.isConnected ? [result.element] : [];
  }; return { queryAll }; }
// server: 'aria-ref=f3e7' jumps to the frame whose seq === 3 before querying
private _jumpToAriaRefFrameIfNeeded(selector, info, frame) { ... body.match(/^f(\d+)e\d+$/) ... }
```
INFERENCE: therefore a ref is only valid after a snapshot of the same frame and while the element is still attached; a navigation or re-render that detaches the node invalidates it (Playwright MCP's error message says exactly this).

### 1.2 Public vs internal across Playwright versions

| API | Status | FACT source |
|---|---|---|
| `page._snapshotForAI()` | private, existed in 1.55 (`packages/playwright-core/src/client/page.ts` on `release-1.55`); absent from 1.59+ | raw release-1.55 vs release-1.59 `page.ts` |
| `locator.ariaSnapshot()` | public since v1.49 | docs/src/api/class-locator.md |
| `page.ariaSnapshot()` + options `mode: 'ai' | 'default'`, `depth` | public since v1.59 ("Snapshots and Locators" in release notes 1.59) | docs/src/release-notes-js.md, class-locator.md |
| `boxes: true` (`[box=x,y,w,h]`) | public since v1.60 | release notes 1.60 |
| `page.ariaSnapshotJSON()` / `locator.ariaSnapshotJSON()` | public since v1.63 (JS only) | release notes 1.63 |
| `aria-ref=eN` selector engine | present in 1.63 injected script (`this._engines.set('aria-ref', ...)`); usable via `page.locator('aria-ref=e2')` but undocumented | release-1.63 injectedScript.ts |
| `page.getByRef('e2')` | documented "since v1.64" (unreleased on 2026-10-04; `main` is 1.64.0-next) | docs/src/api/class-page.md on main |
| `Locator.ariaRef()` | removed as deprecated in 1.60 | release notes 1.60 breaking changes |

**FACT** (class-locator.md): the AI snapshot "1. Includes element references `[ref=e2]`. 2. Does not wait for an element matching the locator, and throws when no elements match. 3. Includes snapshots of `<iframe>`s inside the target." JSON nodes carry `role, name, text, children, checked, disabled, expanded, active, invalid, level, pressed, selected, url, placeholder, ref, cursor:'pointer', box`.

### 1.3 Tool surface worth mirroring (FACT, https://raw.githubusercontent.com/microsoft/playwright-mcp/main/README.md)

Common arg: `target` (string) = "Exact target element reference from the page snapshot, or a unique element selector"; `element` (string, optional) = human-readable description used for permission prompts.

| tool | args |
|---|---|
| `browser_navigate` | `url` |
| `browser_navigate_back` | none |
| `browser_snapshot` | `target?`, `filename?`, `depth?`, `boxes?` |
| `browser_click` | `element?`, `target`, `doubleClick?`, `button?`, `modifiers?` |
| `browser_type` | `element?`, `target`, `text`, `submit?` (press Enter), `slowly?` |
| `browser_press_key` | `key` (`ArrowLeft`, `a`) |
| `browser_select_option` | `element?`, `target`, `values[]` |
| `browser_hover` | `element?`, `target` |
| `browser_fill_form` | `fields[]` |
| `browser_wait_for` | `time?` (<=30s), `text?`, `textGone?` |
| `browser_find` | `text?` or `regex?` - searches the snapshot and returns matching nodes with path + ref |
| `browser_take_screenshot` | `target?`, `type?`, `filename?`, `fullPage?` - "You can't perform actions based on the screenshot" |
| `browser_verify_element_visible` | `role`, `accessibleName` (test-generation tools) |

Config: `--snapshot-mode full|none`, `--snapshot-boxes`. The README's snapshot grammar: `- {ROLE} "Accessible Name": {TEXT}` and `- text: {TEXT}`.

---

## 2. browser-use/browser-use (Python 0.13.x)

**FACT** No `buildDomTree.js` exists on `main` any more (404). DOM capture is pure CDP in `browser_use/dom/service.py` (https://raw.githubusercontent.com/browser-use/browser-use/main/browser_use/dom/service.py):
- Parallel CDP calls: `DOMSnapshot.captureSnapshot({computedStyles: REQUIRED_COMPUTED_STYLES, includePaintOrder: True, includeDOMRects: True})`, `DOM.getDocument({depth: -1, pierce: True})` (pierce => shadow roots and same-process iframes), `Accessibility.getFullAXTree` per frame (via `Page.getFrameTree`), plus a JS evaluation collecting iframe scroll offsets.
- Iframes: `cross_origin_iframes=False` default, `max_iframes=100`, `max_iframe_depth=5`; cross-origin frames included only if >=10px each side; small iframes (<100x100) are not considered interactive.
- Visibility = `is_element_visible_according_to_all_parents(node, html_frames, viewport_threshold)`: CSS visibility from the snapshot plus a reverse walk through containing frames that translates bounds by iframe offsets and scroll; `viewport_threshold=None` disables viewport filtering.

**FACT** Interactivity (`browser_use/dom/serializer/clickable_elements.py`, `ClickableElementDetector.is_interactive`): ordered heuristics - native form controls/`<a href>`, label handling, `disabled` AX property short-circuit, attributes `onclick/onmousedown/onmouseup/onkeydown/onkeyup/tabindex`, interactive `role=` set, AX-tree interactive roles, icon-ish attributes, and a final fallback `snapshot_node.cursor_style == 'pointer'`.

**FACT** Serialization (`dom/serializer/serializer.py`): steps = simplify tree -> paint-order/bbox occlusion filtering -> `_assign_interactive_indices_and_mark_new_nodes`; shadow hosts are always kept and rendered with a `|SHADOW(open)|` / `|SHADOW(closed)|` prefix; SVG children collapsed; interactive nodes render as `[index]<tag attrs>` with `*` prefix when `is_new` (new since the previous step); `<select>` nodes get `compound_components=(count=...,options=...)` hints.

**FACT** Completion (`browser_use/tools/views.py`, `tools/service.py`, `agent/views.py`):
```python
class DoneAction(BaseModel):
    text: str   # "ONLY report data you directly observed in browser_state, tool outputs, or screenshots..."
    success: bool = Field(default=True, description='True if user_request completed successfully')
    files_to_display: list[str] | None = []
# done() -> ActionResult(is_done=True, success=params.success, long_term_memory=f'Task completed: {success} - ...')
```
`AgentOutput` = `{thinking?, evaluation_previous_goal, memory, next_goal, action: list[ActionModel] (min 1)}` (flash mode trims to `memory` + `action`). `Agent.run(max_steps=500)`; `max_failures=5`, `max_actions_per_step=5`, `final_response_after_failure=True`; at the last step the prompt says only the `done` tool is available; a budget warning is injected as the step ratio grows. A separate LLM judge (`use_judge=True`, `JudgementResult{verdict: bool, failure_reason, impossible_task}`) scores the trace but "does NOT override" the agent's own `success`.

**UNVERIFIED**: no "documented failure cases" list was found in README/main; the closest documented guardrails are the budget warning, forced `done` on `max_steps`/`max_failures`, and the DoneAction prompt text above forbidding hallucinated completion.

---

## 3. browserbase/stagehand (v4.1.0, TS SDK + "extension" runtime)

**FACT** (clone of https://github.com/browserbase/stagehand @2a2cd00): packages are `sdk-ts`, `sdk-python`, `sdk-go`, `protocol`, `extension` (the browser-side engine, "understudy").
- `Stagehand.act(instruction | Action, options)`, `observe(instruction, options) -> ObserveResult{data: Action[]}`, `extract(instruction, zodSchema)` (`packages/sdk-ts/src/stagehand.ts`, `packages/protocol/schemas.ts`).
- Perception is a **hybrid DOM + accessibility tree over CDP**, not Playwright snapshots: `Accessibility.getFullAXTree` per frame (`extension/understudy/a11y/snapshot/a11yTree.ts`), DOM maps (tag name, XPath, scrollability) per frame, frame-aware encoded ids `ordinal-backendNodeId` (`capture.ts`: "builds frame-aware encoded ids (ordinal-backendNodeId)"), child iframe outlines spliced into the parent outline (`injectSubtrees`).
- Pruning (`a11yTree.ts`): roles `generic`/`none`/`inlinetextbox` are structural and collapsed unless they carry a DOM tag; redundant `StaticText` children removed; scrollable DOM nodes get role `scrollable, <tag>`.
- Line format (`treeFormatUtils.ts`): `[${encodedId}] ${role}: ${name}` + ` [selected]`/` [checked]`.
- Candidate selection = the LLM: `observe` prompt gives the instruction plus the tree and asks for `{elementId: "frame ordinal and backend node ID copied from the tree", description, method, arguments}` (`extension/inference.ts`); `observeService.ts` maps `elementId` -> XPath via `combinedXpathMap` and returns `selector: "xpath=..."`; `actService.ts` executes `method` (a Playwright-locator-style method name) on that XPath, erroring with "Please use a supported Playwright locator method" for unknown methods. `act` system prompt: "If no element on the page matches the instruction, set `action` to null. Do not fabricate or guess an element."

---

## 4. ChromeDevTools/chrome-devtools-mcp (1.10.1)

**FACT** (https://raw.githubusercontent.com/ChromeDevTools/chrome-devtools-mcp/main/src/TextSnapshot.ts, `src/formatters/SnapshotFormatter.ts`, `src/tools/snapshot.ts`, `docs/tool-reference.md`):
- `take_snapshot {pageId, verbose?, filePath?}` -> `page.pptrPage.accessibility.snapshot({ includeIframes: true, interestingOnly: !verbose })` (Puppeteer).
- uid assignment: `uid = `${snapshotId}_${idCounter++}`` but reused for the same `${loaderId}_${backendNodeId}` across snapshots (`uniqueBackendNodeIdToMcpId`); option nodes get `value = name`.
- Text line: `' '.repeat(depth*2) + ['uid=1_12', role, '"name"', attrs...]`; redundant StaticText children folded into the parent name; the DevTools-selected element is tagged `[selected in the DevTools Elements panel]`.
- Actions take `uid` and resolve through `page.getElementByUid(uid)` -> `textSnapshot.idToNode`, error "No snapshot found ... Use take_snapshot" / `Element uid "x" not found`. Tools: `click {uid, dblClick?}`, `hover {uid}`, `fill {uid, value}` ("true"/"false" for checkboxes), `fill_form {elements:[{uid,value}]}`, `type_text`, `press_key {key: "Control+Shift+R"}`, `drag {from_uid,to_uid}`, `upload_file {uid, filePaths}`, `navigate_page {type: url|back|forward|reload, url?}`, `wait_for {text[]}`, `take_screenshot {uid?, fullPage?}`; every action has `includeSnapshot?` (default false).

---

## 5. vercel-labs/agent-browser (0.38.2)

**FACT** (clone @526157c; CLI is Rust, `cli/src/native/*.rs`; raw CDP over `tokio-tungstenite`, no Playwright/puppeteer dependency in `cli/Cargo.toml`).
- `take_snapshot` (`cli/src/native/snapshot.rs`): `Accessibility.enable` + `Accessibility.getFullAXTree` per session/iframe; optional `--selector` scope via `DOM.querySelector` + subtree backend ids; refs allocated as `e{n}` only for nodes whose role is in `INTERACTIVE_ROLES` (`button, link, textbox, checkbox, radio, combobox, listbox, menuitem, menuitemcheckbox, menuitemradio, option, searchbox, ...`) or that are *cursor-interactive* (`find_cursor_interactive_elements`: JS `querySelectorAll('*')` checking `getComputedStyle(el).cursor === 'pointer'`, `onclick`, `tabindex`, de-duplicating inherited pointer cursors; hidden inputs inside such elements are "promoted"). Link `href` is read via `Runtime.callFunctionOn`. Refs are **durable**: keyed by `(session, frame, backendNodeId)`; a replaced document/iframe invalidates them and ids are never recycled (`removedRefs` in JSON output).
- Output grammar (skill docs, `skill-data/core/references/snapshot-refs.md`): `@e6 [button] "Sign In"`, `@e10 [input type="email"] placeholder="Email"`; `snapshot -i` = interactive only, `-c` compact, `-d N` depth, `--delta` structural diffs.
- Command surface (`commands.md`): `open/goto`, `back/forward/reload`, `snapshot`, `click @e1 [--new-tab]`, `dblclick`, `fill @e2 "text"` (clear+type), `type`, `press Enter|Control+a`, `hover`, `check/uncheck`, `select @e1 "value"`, `scroll down 500`, `scrollintoview @e1`, `drag`, `upload`, `get text|html|value|attr|title|url|box|styles`, `is visible|enabled|checked`, `screenshot [--full] [--if-changed]`, `wait`, `eval`, tabs, cookies, network route, `read` (markdown/llms.txt fetch). Click pre-checks occlusion: "covered by `<div#consent-banner>`".

---

## 6. Screenshot-first agents (Anthropic computer use / browser use, Claude in Chrome, OpenAI CUA)

**FACT** (https://docs.claude.com/en/docs/agents-and-tools/tool-use/computer-use-tool): `computer_toolset_20260801` is a client toolset with 17 member tools (`screenshot`, `zoom {region}`, `left_click {coordinate, text?}`, `right/middle/double/triple_click`, `left_click_drag`, `mouse_move`, `scroll {scroll_direction, scroll_amount, coordinate?}`, `type {text}`, `key {text, repeat?}`, `hold_key`, `wait`, `cursor_position`, ...). Perception is screenshots only; coordinates are in screenshot pixel space and the app must scale them back; no accessibility hints exist in this toolset (the docs recommend keyboard shortcuts for dropdowns/scrollbars).

**FACT** (https://docs.claude.com/en/docs/agents-and-tools/tool-use/browser-use-tool): the newer `browser_toolset_20260801` (27 members) is **hybrid**: `read_page {filter?: "interactive"|"all", depth? (default 15), ref?}` returns an accessibility tree as text where each element carries a tag, e.g. `link "Getting started" [ref_2]`, `textbox "Search docs" [ref_3]`; `find {query}` returns up to 20 matches in the same format; actions take `target: {type:"ref", ref:"ref_2"} | {type:"coordinate", x, y}` (`left_click`, `hover`, `scroll_to`, `form_input {target, value}`, `file_upload`), plus `navigate`, `screenshot`, `get_page_text`, tabs (`browser_state` blocks), optional `read_console`/`read_network`. Output of `read_page` is to be capped at 50,000 chars. Your executor implements every member; the API runs nothing.

**FACT** (https://support.claude.com/en/articles/12012173-getting-started-with-claude-in-chrome): the Chrome extension uses the `debugger`, `scripting`, `tabGroups` permissions ("clicking buttons, typing text, and taking screenshots"; "read text on webpages"; console logs/DOM state). Internal perception details are not public. INFERENCE: it is the productised form of the browser-use toolset above (ref-tagged tree + screenshots).

**FACT** (https://raw.githubusercontent.com/openai/openai-cua-sample-app/main/README.md): OpenAI's reference computer-use agents are built on the Responses API; the browser variant drives Playwright with "locators, screenshots, and browser controls in a persistent session" where the model writes code; the desktop variant uses PyAutoGUI screenshots/mouse/keys. **UNVERIFIED**: platform.openai.com `tools-computer-use` docs (proxy-blocked); the `computer_call` action vocabulary (click/scroll/type/keypress/screenshot with `safety_checks`) is from memory, not re-read today.

---

## 7. Cross-cutting findings (INFERENCE unless noted)

1. Every text-first agent converges on **accessibility tree + stable per-element handle**: Playwright `[ref=eN]`, chrome-devtools `uid=S_N`, agent-browser `@eN`, stagehand `[ordinal-backendNodeId]`, Anthropic `[ref_N]`, browser-use `[N]`. Handles are only valid relative to the last snapshot of that frame; all of them error when the handle is stale and tell the model to re-snapshot.
2. "Interactive" is decided by role (button/link/textbox/...), native controls, event-handler attributes, `tabindex`, and `cursor: pointer` as last resort (browser-use, agent-browser, Playwright `cursor=pointer` annotation). Playwright is the only one that additionally requires `receivesPointerEvents` (hit-testable) for a ref.
3. Iframes: Playwright recurses and prefixes `fN`; stagehand stitches per-frame trees with XPath prefixes; browser-use pierces same-origin frames only by default; agent-browser expands one level of iframes. Shadow DOM: Playwright and chrome-devtools use the engine's AX tree (already pierced); browser-use/stagehand use `DOM.getDocument({pierce:true})`.
4. Completion signalling: browser-use has an explicit `done{text, success}` action plus an independent judge; stagehand returns `action: null` when nothing matches; Playwright MCP / chrome-devtools leave completion to the host loop.

---

## 8. Recommendation: minimal LLM tool loop for behavioural tests (Playwright aria snapshot + refs)

### 8.1 Perception (deterministic, no LLM)
```ts
// Playwright >= 1.59 (public). Today pin playwright@1.63.0.
const yaml = await page.ariaSnapshot({ mode: 'ai' });              // string with [ref=eN], [cursor=pointer], [active]
const json = await page.ariaSnapshotJSON({ mode: 'ai' });          // 1.63+: typed nodes {role,name,ref,cursor,url,...}
const el   = page.locator(`aria-ref=${ref}`);                      // works in 1.63 (undocumented engine)
// const el = page.getByRef(ref);                                  // 1.64+ (documented sugar for the same thing)
```
Validate `ref` with `/^(f\d+)?e\d+$/` exactly like Playwright MCP; on failure return the MCP wording ("Ref not found in the current page snapshot. Try capturing new snapshot."). The same `ariaSnapshotJSON` output is the input for the deterministic "agent perception" model (interactive = node has `ref`; clickable-looking = `cursor === 'pointer'`; iframes = `role:'iframe'` with `f` prefixed child refs).

### 8.2 Tool set (mirror of Playwright MCP, trimmed)
| name | input schema (JSON Schema / zod) | implementation |
|---|---|---|
| `snapshot` | `{ depth?: number }` | `page.ariaSnapshot({mode:'ai', depth})` + title/url header |
| `click` | `{ ref: string, doubleClick?: boolean }` | `locator.click()` / `dblclick()` |
| `type` | `{ ref, text, submit?: boolean }` | `locator.fill(text)`; `press('Enter')` if submit |
| `select` | `{ ref, values: string[] }` | `locator.selectOption(values)` |
| `press_key` | `{ key }` | `page.keyboard.press(key)` |
| `navigate` | `{ url }` | `page.goto(url)` (allow-list origins) |
| `scroll` | `{ ref?, direction: 'up'|'down', amount?: number }` | `mouse.wheel` or `scrollIntoViewIfNeeded` |
| `back` | `{}` | `page.goBack()` |
| `finish` | `{ verdict: 'pass'|'fail'|'blocked', evidence: string, observed: string[] }` | ends the loop (no execute) |

Rules: every mutating tool returns a fresh snapshot (as Playwright MCP's `snapshot-mode full`), wrapped in `tab.waitForCompletion`-style settling (wait for load state + a short network-idle race); cap snapshot text (e.g. 40k chars, like Anthropic's 50k cap) and fall back to `depth`; refuse `navigate` outside the test origin; log every call for the test report.

### 8.3 Loop control
- Hard caps: `maxSteps` (10-25 for a behavioural check), wall-clock timeout, `maxOutputTokens`; stop when the model calls `finish`; if the cap is hit, run one last turn where **only** `finish` is active (browser-use's "last step: only `done`" trick) and otherwise record `verdict: 'blocked'` deterministically.
- Treat tool errors as tool results (`is_error`), never exceptions, so the model can recover (stale ref -> re-snapshot).
- Keep the transcript append-only (prompt-cache friendly; required by Anthropic's preserved-thinking rules).

### 8.4 Provider-agnostic SDK choice

Option A - **Vercel AI SDK `ai@7`** (recommended, smallest robust option). FACT (https://raw.githubusercontent.com/vercel/ai/main/content/docs/03-ai-sdk-core/15-tools-and-tool-calling.mdx and `07-reference/01-ai-sdk-core/01-generate-text.mdx`): `generateText({ model, tools, stopWhen, prepareStep, onStepFinish })`; `maxSteps` was removed in v5 in favour of `stopWhen` (`isStepCount(n)`, `hasToolCall(name)`, arrays = OR); the condition is "only evaluated when the last step contains tool results"; v6 changed the default from `isStepCount(1)` to `isStepCount(20)`; v6 also renamed `Experimental_Agent` -> `ToolLoopAgent` and removed `name` from function tool definitions. `prepareStep` can override `activeTools`/`toolChoice`/`instructions` per step (use it for the final-step "only finish" rule).
```ts
import { generateText, tool, isStepCount, hasToolCall } from 'ai';
import { z } from 'zod';
import { anthropic } from '@ai-sdk/anthropic';               // 4.0.71
import { openai } from '@ai-sdk/openai';                     // 4.0.83
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'; // 3.0.62 (Ollama / any OpenAI-compatible server)

const ollama = createOpenAICompatible({ name: 'ollama', baseURL: 'http://localhost:11434/v1' });
const model = provider === 'anthropic' ? anthropic('claude-opus-5-5')
            : provider === 'openai'    ? openai('gpt-5.5')
            : ollama.chatModel('qwen3:8b');

const { steps } = await generateText({
  model, system: SYSTEM, prompt: task,
  tools: {
    snapshot: tool({ description: '...', inputSchema: z.object({ depth: z.number().optional() }), execute: snapshotTool }),
    click:    tool({ description: '...', inputSchema: z.object({ ref: z.string().regex(/^(f\d+)?e\d+$/) }), execute: clickTool }),
    finish:   tool({ description: '...', inputSchema: z.object({ verdict: z.enum(['pass','fail','blocked']), evidence: z.string() }) }), // no execute => loop stops
  },
  stopWhen: [isStepCount(20), hasToolCall('finish')],
  prepareStep: ({ stepNumber }) => stepNumber >= 19 ? { activeTools: ['finish'], toolChoice: 'required' } : {},
});
```
Caveats (FACT): `@ai-sdk/*` 4.x peer-depend on `zod ^3.25.76 || ^4.1.8`; Ollama's OpenAI endpoint supports `tools` but **not** `tool_choice` (https://raw.githubusercontent.com/ollama/ollama/main/docs/api/openai-compatibility.mdx), so the "force finish" step must be prompt-driven there (and also on Claude Opus 5.5 / Sonnet 5.5 / Fable 5.1, whose API rejects forced `tool_choice: any|tool` - see the claude-api skill). Community `ollama-ai-provider-v2@4.0.1` (peer `ai ^7`) is an alternative to the OpenAI-compatible route; UNVERIFIED which is more robust for tool calls.

Option B - **two thin native adapters** (no AI SDK). FACT shapes:
- Anthropic (`@anthropic-ai/sdk` 0.131.0, https://raw.githubusercontent.com/anthropics/anthropic-sdk-typescript/main/helpers.md and `examples/tools.ts`): tools are `{name, description, input_schema}`; response `stop_reason === 'tool_use'` with `tool_use {id,name,input}` blocks; reply with a user message of `tool_result {tool_use_id, content, is_error?}` blocks (all results in ONE message); or use the beta runner `client.beta.messages.toolRunner({ model, max_tokens, messages, tools: [betaZodTool({name, inputSchema, run})], max_iterations })` (`max_iterations` default: no limit).
- OpenAI (`openai` 7.28.0, https://raw.githubusercontent.com/openai/openai-node/master/src/resources/chat/completions/completions.ts and `responses/responses.ts`): Chat Completions `tools: [{type:'function', function:{name, description, parameters, strict?}}]`, model returns `message.tool_calls[{id, type:'function', function:{name, arguments(JSON string)}}]`, reply with `{role:'tool', tool_call_id, content}`; Responses API `tools: [{type:'function', name, parameters, strict}]` with `function_call` / `function_call_output` items. Ollama implements both `/v1/chat/completions` and the non-stateful `/v1/responses` (FACT, ollama docs).
INFERENCE: Option B is ~150 lines per adapter plus message-history conversion; Option A gives the same two providers, Ollama and step control in ~40 lines and is the smaller surface to maintain. Pick A; keep the tool definitions as plain JSON-Schema objects internally so B stays a drop-in later.

### 8.5 Open items / UNVERIFIED
- OpenAI official computer-use docs and ai-sdk.dev pages were proxy-blocked; facts above come from the GitHub mirrors of the same docs.
- Robustness of small local models (Ollama) at multi-step tool calling without `tool_choice` is untested here.
- `page.getByRef` requires Playwright 1.64 (not yet on npm); the `aria-ref=` selector in 1.63 is undocumented and could change.
