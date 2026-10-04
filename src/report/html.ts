import { DIMENSION_WEIGHTS, TASK_SUCCESS_WEIGHT } from '../scoring/index.js';
import type { CheckResult, EvidenceItem, ScanResult, TaskResult, TaskStep } from '../types.js';

/**
 * Self-contained HTML report: inline CSS, no external requests, a few lines of vanilla JS
 * so collapsed sections expand when the page is printed.
 */
export function renderHtml(result: ScanResult): string {
  const { meta, checks, tasks } = result;
  const by = (statuses: CheckResult['status'][]) =>
    checks.filter((c) => statuses.includes(c.status));
  const failures = by(['fail']);
  const warnings = by(['warn']);
  const passed = by(['pass']);
  const other = by(['na', 'info']);
  const title = `Agentic Web Check report: ${meta.url}`;

  const body = [
    renderHeader(result),
    renderScoreboard(result),
    section(
      'failures',
      `Failures (${failures.length})`,
      renderChecks(failures, 'No failed checks.'),
    ),
    section('warnings', `Warnings (${warnings.length})`, renderChecks(warnings, 'No warnings.')),
    meta.mode === 'behavioural' || tasks.length
      ? section(
          'tasks',
          `Behavioural tests (${tasks.length})`,
          tasks.length ? tasks.map(renderTask).join('') : empty('No tasks were run.'),
        )
      : '',
    section('passed', `Passed checks (${passed.length})`, renderChecks(passed, 'None.'), false),
    section(
      'other',
      `Not applicable / info (${other.length})`,
      renderChecks(other, 'None.'),
      false,
    ),
    section('fixes', 'Suggested fixes', renderFixes(result)),
    section('pages', `Pages scanned (${result.pages.length})`, renderPages(result)),
    section('methodology', 'Methodology', renderMethodology(result)),
    renderFooter(result),
  ].join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="agentic-web-check ${escapeHtml(meta.version)}">
<title>${escapeHtml(title)}</title>
<style>${CSS}</style>
</head>
<body>
<main class="wrap">
${body}
</main>
<script>${PRINT_JS}</script>
</body>
</html>
`;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ---------- sections ---------- */

function renderHeader(r: ScanResult): string {
  const m = r.meta;
  const opts = m.options as Record<string, unknown>;
  const agent = typeof opts.agent === 'string' ? opts.agent : r.tasks[0]?.agent;
  const model = typeof opts.model === 'string' ? opts.model : r.tasks.find((t) => t.model)?.model;
  const mode =
    m.mode === 'behavioural'
      ? `Behavioural verification (${r.tasks.length} task${r.tasks.length === 1 ? '' : 's'}, agent ${agent ?? 'unknown'}${model ? `, model ${model}` : ''})`
      : 'Deterministic scan';
  return `<header class="head">
<p class="tool">Agentic Web Check</p>
<h1><a href="${escapeHtml(m.url)}">${escapeHtml(m.url)}</a></h1>
<dl class="meta">
${dt('Mode', mode)}${dt('Scanned', `${fmtDate(m.startedAt)} (${fmtMs(m.durationMs)})`)}${dt('Tool version', m.version)}${dt('Methodology', `v${m.methodology}`)}${dt('Browser', `${m.browser.name} ${m.browser.version}`)}${dt('Node', m.node)}
</dl>
</header>`;
}

function renderScoreboard(r: ScanResult): string {
  const dims = r.dimensions.filter((d) => !(d.dimension === 'task-success' && d.score === null));
  const rows = dims.map(
    (d) =>
      `<tr><th scope="row">${escapeHtml(d.label)}</th><td class="num"><span class="pill ${band(d.score)}">${scoreText(d.score)}</span></td><td class="num">${d.weight}</td>${count(d.passed, 'pass-c')}${count(d.warned, 'warn-c')}${count(d.failed, 'fail-c')}<td class="num muted">${d.checks.length}</td></tr>`,
  );
  return `<section class="score" aria-labelledby="overall">
<div class="overall ${band(r.overall)}">
<p class="label" id="overall">Overall</p>
<p class="big">${scoreText(r.overall)}<span class="denom">${r.overall === null ? '' : '/100'}</span></p>
</div>
<table class="dims">
<thead><tr><th>Dimension</th><th class="num">Score</th><th class="num">Weight</th><th class="num">Pass</th><th class="num">Warn</th><th class="num">Fail</th><th class="num">Checks</th></tr></thead>
<tbody>${rows.join('')}</tbody>
</table>
</section>`;
}

function renderChecks(list: CheckResult[], emptyText: string): string {
  if (!list.length) return empty(emptyText);
  const order = { 10: 0, 7: 1, 3: 2, 1: 3 };
  return [...list]
    .sort((a, b) => order[a.weight] - order[b.weight] || a.id.localeCompare(b.id))
    .map(renderCheck)
    .join('');
}

function renderCheck(c: CheckResult): string {
  const metrics = Object.entries(c.metrics ?? {})
    .map(([k, v]) => `<span class="chip"><b>${escapeHtml(k)}</b>: ${escapeHtml(String(v))}</span>`)
    .join('');
  const refs = c.references.length
    ? `<ul class="refs">${c.references.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul>`
    : '';
  return `<article class="check" id="check-${escapeHtml(c.id)}">
<header class="check-head">
<span class="badge ${c.status}">${c.status.toUpperCase()}</span>
<h3>${escapeHtml(c.title)}</h3>
<span class="ids"><code>${escapeHtml(c.id)}</code> &middot; ${escapeHtml(c.dimension)} &middot; weight ${c.weight}</span>
</header>
<p class="summary">${escapeHtml(c.summary)}</p>
${c.error ? `<p class="error"><b>Check error:</b> ${escapeHtml(c.error)}</p>` : ''}
${metrics ? `<p class="chips">${metrics}</p>` : ''}
<dl class="kv">
${dt('Rationale', c.rationale)}${refs ? `<dt>References</dt><dd>${refs}</dd>` : ''}${c.remediation ? dt('Remediation', c.remediation) : ''}${c.pages?.length ? dt('Pages', c.pages.join(', ')) : ''}
</dl>
${renderEvidence(c.evidence)}
</article>`;
}

function renderEvidence(items: EvidenceItem[]): string {
  if (!items.length) return '';
  const rows = items
    .map(
      (e) =>
        `<tr>${cell(e.url)}${cell(e.ref ?? e.selector)}${cell(e.element)}${cell(e.observed)}${cell(e.expected)}${cell(e.note)}</tr>`,
    )
    .join('');
  return `<table class="evidence"><thead><tr><th>URL</th><th>Ref / selector</th><th>Element</th><th>Observed</th><th>Expected</th><th>Note</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderTask(t: TaskResult): string {
  const steps = t.steps.length
    ? `<ol class="steps">${t.steps.map(renderStep).join('')}</ol>`
    : '<p class="muted">No actions were needed.</p>';
  const assertions = t.assertions.length
    ? `<table class="assertions"><thead><tr><th>Assertion</th><th>Holds</th><th>Observed</th></tr></thead><tbody>${t.assertions
        .map(
          (a) =>
            `<tr>${cell(compact(a.assertion), 160, 'code')}<td class="${a.holds ? 'ok' : 'bad'}">${a.holds ? '&#10003; yes' : '&#10007; no'}</td>${cell(a.observed, 200)}</tr>`,
        )
        .join('')}</tbody></table>`
    : '';
  const shots = t.screenshots
    .map((s) => {
      const rel = screenshotHref(s.path);
      return `<li>${escapeHtml(s.label)}: <a href="${escapeHtml(rel)}">${escapeHtml(rel)}</a></li>`;
    })
    .join('');
  const usage = t.usage
    ? `${t.usage.calls} calls, ${t.usage.inputTokens} in / ${t.usage.outputTokens} out tokens`
    : '';
  return `<article class="task" id="task-${escapeHtml(t.name)}">
<header class="check-head">
<span class="badge ${t.verdict.toLowerCase()}">${t.verdict}</span>
<h3>${escapeHtml(t.name)}</h3>
<span class="ids">${escapeHtml(t.agent)}${t.model ? ` &middot; ${escapeHtml(t.model)}` : ''} &middot; ${escapeHtml(t.safety)} &middot; ${fmtMs(t.durationMs)}</span>
</header>
<p class="summary">${escapeHtml(t.goal)}</p>
<dl class="kv">
${dt('Verdict', `${t.verdict}: ${t.reason}`)}${dt('Route', `${t.startUrl} → ${t.finalUrl}${t.finalTitle ? ` (${t.finalTitle})` : ''}`)}${t.answer ? dt('Answer', t.answer) : ''}${t.blocker ? dt('Blocker', t.blocker) : ''}${t.error ? dt('Error', t.error) : ''}${usage ? dt('LLM usage', usage) : ''}${t.consoleErrors.length ? dt('Console errors', t.consoleErrors.join(' | ')) : ''}
</dl>
<h4>Steps (${t.steps.length})</h4>
${steps}
${assertions ? `<h4>Assertions</h4>${assertions}` : ''}
${shots ? `<h4>Screenshots</h4><ul class="shots">${shots}</ul>` : ''}
</article>`;
}

function renderStep(s: TaskStep): string {
  const first = (s.result ?? '').split('\n')[0] ?? '';
  const flags = [
    s.noFeedback ? '<span class="flag warn-c">no visible change</span>' : '',
    s.error ? `<span class="flag fail-c">error: ${escapeHtml(s.error)}</span>` : '',
  ].join('');
  return `<li><div class="step"><code class="step-tool">${escapeHtml(s.tool)}</code> <code class="args" title="${escapeHtml(compact(s.args))}">${escapeHtml(trunc(compact(s.args), 120))}</code> <span class="muted">${fmtMs(s.durationMs)}</span>${flags}</div><div class="step-result" title="${escapeHtml(s.result ?? '')}">${escapeHtml(trunc(first, 200))}</div></li>`;
}

function renderFixes(r: ScanResult): string {
  if (!r.suggestedFixes.length)
    return empty('Nothing to fix: no failed or warned checks with a remediation.');
  return `<ol class="fixes">${r.suggestedFixes
    .map(
      (f) =>
        `<li><b>${escapeHtml(f.title)}</b> <span class="ids">(<a href="#check-${escapeHtml(f.checkId)}"><code>${escapeHtml(f.checkId)}</code></a>, weight ${f.weight})</span><br>${escapeHtml(f.remediation)}</li>`,
    )
    .join('')}</ol>`;
}

function renderPages(r: ScanResult): string {
  if (!r.pages.length) return empty('No pages recorded.');
  const redirected = r.pages.some((p) => p.finalUrl !== p.url);
  const rows = r.pages
    .map(
      (p) =>
        `<tr>${cell(p.url, 80)}${redirected ? cell(p.finalUrl !== p.url ? p.finalUrl : '', 80) : ''}<td class="num">${p.status ?? 'n/a'}</td>${cell(p.title, 60)}<td class="num">${fmtMs(p.loadMs)}</td><td class="num">${p.interactiveCount}</td><td class="num">${p.snapshotChars}</td><td class="num">${p.consoleErrors}</td>${cell(p.error)}</tr>`,
    )
    .join('');
  return `<table class="pages"><thead><tr><th>URL</th>${redirected ? '<th>Redirected to</th>' : ''}<th class="num">Status</th><th>Title</th><th class="num">Load</th><th class="num">Interactive</th><th class="num">Snapshot chars</th><th class="num">Console errors</th><th>Error</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderMethodology(r: ScanResult): string {
  const withTasks = r.dimensions.some((d) => d.dimension === 'task-success' && d.score !== null);
  const dims = Object.entries(DIMENSION_WEIGHTS)
    .map(
      ([k, w]) =>
        `<li>${escapeHtml(k)}: ${w}${withTasks ? ` &times; 0.7 = ${Math.round(w * 70) / 100}` : ''}</li>`,
    )
    .join('');
  return `<p>Every check has a status (<b>pass</b> = 1, <b>warn</b> = 0.5, <b>fail</b> = 0; <b>na</b> and <b>info</b> are not scored) and a weight that follows the Lighthouse accessibility scale: <b>10</b> critical, <b>7</b> serious, <b>3</b> moderate, <b>1</b> minor. A dimension score is round(100 &times; &Sigma;(score &times; weight) / &Sigma;(weight)) over its scorable checks; a dimension with none is n/a and excluded.</p>
<p>The overall score is the weighted mean of the available dimensions. Dimension weights${withTasks ? ' (scaled by 0.7 because behavioural tasks were run)' : ''}:</p>
<ul class="weights">${dims}${withTasks ? `<li>task-success: ${TASK_SUCCESS_WEIGHT}</li>` : `<li>task-success: ${TASK_SUCCESS_WEIGHT} when tasks are run (not scored in a deterministic scan)</li>`}</ul>
<p>Task success = 100 &times; PASS / (PASS + FAIL + BLOCKED); INCONCLUSIVE runs are excluded. Methodology version ${escapeHtml(r.meta.methodology)}; see docs/SCORING.md in the project for the full catalogue.</p>`;
}

function renderFooter(r: ScanResult): string {
  return `<footer class="foot">
<details><summary>Scan metadata (JSON)</summary><pre>${escapeHtml(JSON.stringify(r.meta, null, 2))}</pre></details>
<p class="muted">Generated by agentic-web-check ${escapeHtml(r.meta.version)} on ${fmtDate(r.meta.finishedAt)}.</p>
</footer>`;
}

/* ---------- small helpers ---------- */

function section(id: string, heading: string, inner: string, open = true): string {
  return `<details class="section" id="${id}"${open ? ' open' : ''}>
<summary><h2>${escapeHtml(heading)}</h2></summary>
<div class="section-body">${inner}</div>
</details>`;
}

function empty(text: string): string {
  return `<p class="muted">${escapeHtml(text)}</p>`;
}

function dt(k: string, v: string): string {
  return `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>\n`;
}

function cell(v: string | undefined, max = 120, cls = ''): string {
  if (!v) return '<td></td>';
  const short = trunc(v, max);
  const t = short === v ? '' : ` title="${escapeHtml(v)}"`;
  const inner = cls === 'code' ? `<code>${escapeHtml(short)}</code>` : escapeHtml(short);
  return `<td${t}>${inner}</td>`;
}

function trunc(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function compact(v: unknown): string {
  return JSON.stringify(v) ?? '';
}

function band(score: number | null): string {
  if (score === null) return 'na';
  if (score >= 90) return 'b-green';
  if (score >= 70) return 'b-lime';
  if (score >= 50) return 'b-amber';
  return 'b-red';
}

function count(n: number, cls: string): string {
  return `<td class="num ${n > 0 ? cls : 'muted'}">${n}</td>`;
}

function scoreText(score: number | null): string {
  return score === null ? 'n/a' : String(score);
}

function fmtMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? escapeHtml(iso)
    : d
        .toISOString()
        .replace('T', ' ')
        .replace(/\.\d+Z$/, ' UTC');
}

function screenshotHref(p: string): string {
  const norm = p.replace(/\\/g, '/');
  const i = norm.lastIndexOf('/screenshots/');
  return i >= 0 ? norm.slice(i + 1) : norm;
}

const PRINT_JS = `(function(){var open=[];window.addEventListener('beforeprint',function(){open=[];document.querySelectorAll('details').forEach(function(d){if(!d.open){open.push(d);d.open=true;}});});window.addEventListener('afterprint',function(){open.forEach(function(d){d.open=false;});open=[];});})();`;

const CSS = `
:root{--bg:#fff;--fg:#1c1f23;--muted:#5f6670;--line:#dfe3e8;--panel:#f6f7f9;--link:#0b5fad;--green:#1f7a3d;--lime:#5f8f1f;--amber:#b36b00;--red:#b3261e;--grey:#6b7280;--on:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#15171a;--fg:#e6e8eb;--muted:#9aa3ad;--line:#2f353c;--panel:#1d2126;--link:#6cb2ff;--green:#3fa964;--lime:#8fbf3a;--amber:#d99a2b;--red:#e5534b;--grey:#8a929b;--on:#0f1113}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
.wrap{max-width:1100px;margin:0 auto;padding:24px 16px 48px}
a{color:var(--link)}
code,pre{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.9em}
pre{background:var(--panel);border:1px solid var(--line);padding:12px;overflow:auto;border-radius:4px}
h1,h2,h3,h4{line-height:1.25;margin:0}
h1{font-size:1.5rem;font-weight:600;word-break:break-all}
h1 a{color:inherit;text-decoration:none}
h2{font-size:1.15rem;font-weight:600;display:inline}
h3{font-size:1.02rem;font-weight:600}
h4{font-size:.85rem;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin:16px 0 6px}
.muted{color:var(--muted)}
.head{border-bottom:1px solid var(--line);padding-bottom:16px;margin-bottom:20px}
.tool{margin:0 0 4px;font-size:.85rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
dl.meta{display:grid;grid-template-columns:max-content 1fr;gap:2px 16px;margin:12px 0 0;font-size:.9rem}
dl.meta dt{color:var(--muted)}
dl.meta dd,dl.kv dd{margin:0;overflow-wrap:anywhere}
.score{display:grid;grid-template-columns:200px 1fr;gap:20px;align-items:start;margin-bottom:28px}
.overall{border:2px solid var(--grey);border-radius:6px;padding:16px;text-align:center}
.overall .label{margin:0;font-size:.85rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
.overall .big{margin:4px 0 0;font-size:4rem;font-weight:700;line-height:1}
.overall .denom{font-size:1.1rem;font-weight:400;color:var(--muted);margin-left:2px}
.overall.b-green{border-color:var(--green);color:var(--green)}
.overall.b-lime{border-color:var(--lime);color:var(--lime)}
.overall.b-amber{border-color:var(--amber);color:var(--amber)}
.overall.b-red{border-color:var(--red);color:var(--red)}
.overall.na{color:var(--grey)}
table{border-collapse:collapse;width:100%;font-size:.88rem}
th,td{text-align:left;vertical-align:top;padding:5px 8px;border-bottom:1px solid var(--line)}
th{font-weight:600;color:var(--muted);font-size:.8rem;text-transform:uppercase;letter-spacing:.03em}
td.num,th.num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.dims th[scope=row]{color:var(--fg);text-transform:none;font-size:.88rem}
.pill{display:inline-block;min-width:3em;text-align:center;padding:1px 8px;border-radius:999px;color:var(--on);font-weight:600}
.pill.b-green{background:var(--green)}.pill.b-lime{background:var(--lime)}.pill.b-amber{background:var(--amber)}.pill.b-red{background:var(--red)}.pill.na{background:var(--grey)}
.pass-c{color:var(--green)}.warn-c{color:var(--amber)}.fail-c{color:var(--red)}
details.section{border-top:1px solid var(--line);padding:12px 0 8px}
details.section>summary{cursor:pointer;list-style:none;display:flex;align-items:center;gap:10px}
details.section>summary::-webkit-details-marker{display:none}
details.section>summary::before{content:"";width:0;height:0;border:6px solid transparent;border-left:9px solid var(--muted);display:inline-block;transition:transform .12s}
details.section[open]>summary::before{transform:rotate(90deg)}
.section-body{padding:12px 0 4px}
.check,.task{border:1px solid var(--line);border-radius:6px;padding:12px 14px;margin:0 0 12px;background:var(--panel)}
.check-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px 12px}
.ids{font-size:.82rem;color:var(--muted)}
.badge{display:inline-block;font-size:.72rem;font-weight:700;letter-spacing:.05em;padding:2px 8px;border-radius:3px;color:var(--on);background:var(--grey);align-self:center}
.badge.pass{background:var(--green)}.badge.warn{background:var(--amber)}.badge.fail{background:var(--red)}
.badge.na,.badge.info,.badge.inconclusive{background:var(--grey)}.badge.blocked{background:var(--amber)}
.summary{margin:8px 0 6px;font-size:.98rem}
.error{color:var(--red);margin:4px 0}
.chips{margin:4px 0 8px;display:flex;flex-wrap:wrap;gap:6px}
.chip{display:inline-block;font-size:.78rem;background:var(--bg);border:1px solid var(--line);border-radius:3px;padding:1px 7px}
.chip b{font-weight:600;color:var(--muted)}
dl.kv{display:grid;grid-template-columns:max-content 1fr;gap:3px 14px;margin:6px 0 8px;font-size:.9rem}
dl.kv dt{color:var(--muted)}
ul.refs{margin:0;padding-left:18px}
.evidence,.assertions,.pages{margin-top:8px;background:var(--bg)}
.evidence td,.assertions td,.pages td{overflow-wrap:anywhere;max-width:28em}
td.ok{color:var(--green);white-space:nowrap}td.bad{color:var(--red);white-space:nowrap}
ol.steps{margin:0;padding-left:26px}
ol.steps li{margin:0 0 6px}
.step{display:flex;flex-wrap:wrap;gap:8px;align-items:baseline}
.step-tool{font-weight:600}
.step .args{color:var(--muted);overflow-wrap:anywhere}
.flag{font-size:.8rem;font-weight:600}
.step-result{font-size:.88rem;color:var(--muted);overflow-wrap:anywhere}
ul.shots{margin:0;padding-left:18px;font-size:.9rem;overflow-wrap:anywhere}
ol.fixes li{margin:0 0 10px}
ul.weights{columns:2;margin:0 0 12px}
.foot{border-top:1px solid var(--line);margin-top:24px;padding-top:12px;font-size:.9rem}
.foot summary{cursor:pointer}
@media (max-width:720px){.score{grid-template-columns:1fr}.overall{max-width:200px}ul.weights{columns:1}dl.meta,dl.kv{grid-template-columns:1fr}dl.meta dt,dl.kv dt{margin-top:4px}}
@media print{body{font-size:11pt}.wrap{max-width:none;padding:0}.check,.task{break-inside:avoid;background:none}details.section>summary::before{display:none}a{color:inherit;text-decoration:none}.pill,.badge{-webkit-print-color-adjust:exact;print-color-adjust:exact}.overall .big{font-size:3rem}}
`;
