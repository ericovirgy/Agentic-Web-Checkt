# Machine-readable web interfaces for AI agents — state as of 2026-10-04

Labels: **FACT (url)** = opened the primary source this session; **FACT-S (url)** = confirmed only through a search-engine snippet of that source (page itself was egress-blocked); **INFERENCE** = my reading; **UNVERIFIED** = secondary/unconfirmed.

## 1. WebMCP

**Status.** W3C Web Machine Learning *Community Group* draft (`Status: CG-DRAFT`, `Group: webml`), editors Brandon Walderman (Microsoft), Khushal Sagar and Dominic Farolino (Google). Not a Working Group deliverable, not a W3C Recommendation. — FACT (https://github.com/webmachinelearning/webmcp/blob/main/index.bs; rendered at https://webmachinelearning.github.io/webmcp/). WebMCP became an official CG deliverable with the CG charter that went operational 2025-09-25 — FACT-S (https://lists.w3.org/Archives/Public/public-webmachinelearning/2025Sep/0007.html). Repo first published 2025-08-13 — FACT (repo README).

**Browser implementations** (from the repo's own `implementation-status.md` — FACT, https://github.com/webmachinelearning/webmcp/blob/main/implementation-status.md):
- Chrome: Origin Trial active from Chrome 149; local testing flag `chrome://flags/#enable-webmcp-testing`. Blink "Intent to Experiment" approved for **M149–M156 inclusive**, Blink component `Blink>Agentic Platform>WebMCP`, web-feature id "navigator.modelContext (WebMCP)" — FACT-S (https://groups.google.com/a/chromium.org/g/blink-dev/c/gmYffo5WOE8/m/OJxuQRP3AAAJ).
- Edge: Origin Trial launched in Edge 150, mirrors Chrome. ChatGPT Desktop: "full WebMCP support". Brave: experimental via Leo (brave issue 55232). Meta Ray-Ban Display: forthcoming. Firefox: Bugzilla 2018306, no implementation. Safari: WebKit standards-positions #670, no implementation.
- Chrome DevTools has a WebMCP pane under Application panel — FACT-S (https://developer.chrome.com/docs/devtools/application/webmcp). Chrome developer docs: https://developer.chrome.com/docs/ai/webmcp (imperative-api page published 2026-05-18) — FACT-S.
- Google I/O 2026 (May 19–20): "Gemini in Chrome will soon support WebMCP" — FACT-S (https://sdtimes.com/ai/google-i-o-2026-introduces-the-agentic-web-era-with-major-chrome-updates/). Whether any shipping consumer agent calls page tools today: UNVERIFIED.
- Secondary reports: `navigator.modelContext` deprecated in Chrome 150 (both spellings still work during the OT); `provideContext()/clearContext()` removed ~March 2026 — UNVERIFIED exact milestones (https://byteiota.com/webmcp-chrome-150-navigator-modelcontext-deprecation/, https://mcpplaygroundonline.com/blog/what-is-webmcp). The repo confirms only that `navigator.modelContext` is "deprecated" in favour of `document.modelContext` — FACT.

**Imperative API — exact WebIDL in the current spec** (FACT, index.bs):
```webidl
partial interface Document { [SecureContext, SameObject] readonly attribute ModelContext modelContext; };
[Exposed=Window, SecureContext] interface ModelContext : EventTarget {
  Promise<undefined> registerTool(ModelContextTool tool, optional ModelContextRegisterToolOptions options = {});
  Promise<sequence<RegisteredTool>> getTools(optional ModelContextGetToolOptions options = {});
  Promise<DOMString> executeTool(RegisteredTool tool, optional object inputObject, optional ModelContextExecuteToolOptions options = {});
  attribute EventHandler ontoolchange; attribute EventHandler ontoolactivated; attribute EventHandler ontoolcancel; };
dictionary ModelContextTool { required DOMString name; USVString title; required DOMString description; object inputSchema;
  required ToolExecuteCallback execute; ToolAnnotations annotations; };
dictionary ToolAnnotations { boolean readOnlyHint = false; boolean untrustedContentHint = false; boolean consequentialHint = false; boolean debugging = false; };
callback ToolExecuteCallback = Promise<any> (object inputObject, ToolExecuteCallbackOptions options); // options.signal: AbortSignal
dictionary ModelContextRegisterToolOptions { sequence<USVString> exposedTo; AbortSignal signal; };
dictionary ModelContextGetToolOptions { sequence<USVString> fromOrigins; };
dictionary ModelContextExecuteToolOptions { AbortSignal signal; };
dictionary RegisteredTool { required DOMString name; DOMString title; required DOMString description; object inputSchema; required Window window; required USVString origin; ToolAnnotations annotations; };
// ToolActivatedEvent / ToolCancelEvent carry readonly attribute DOMString toolName
```
- There is **no** `partial interface Navigator`, **no** `unregisterTool`, **no** `provideContext`/`clearContext` in the spec; unregistration is via the `signal` AbortSignal passed to `registerTool` — FACT. Access is gated by a `tools` Permissions-Policy feature — FACT.
- Canonical README example (FACT): `await document.modelContext.registerTool({ name: "add-todo", description: "...", inputSchema: {type:"object", properties:{text:{type:"string"}}, required:["text"]}, async execute({ text }) { ...; return { content: [{ type: "text", text: "..." }] }; } });` — the execute result follows MCP's `content[]` shape.
- Continuations (separate explainer, FACT https://github.com/webmachinelearning/webmcp/blob/main/continuations-explainer.md): `options.invocation.requestToken()` inside execute, then `document.modelContext.resumeTool(token, callback)` in the next document. Not in index.bs yet.

**Declarative API** (FACT, https://github.com/webmachinelearning/webmcp/blob/main/declarative-api-explainer.md; index.bs section is "entirely a TODO"):
```html
<form toolname="search-cars" tooldescription="Perform a car make/model search" toolautosubmit>
  <input type=text name="make"  toolparamdescription="The vehicle's make (e.g., BMW, Ford)" required>
  <input type=text name="model" toolparamdescription="The vehicle's model" required>
  <button type=submit>Search</button></form>
```
Form attributes: `toolname`, `tooldescription`, `toolautosubmit` (boolean; without it the browser focuses the submit button for user confirmation). Control attribute: `toolparamdescription`. Schema is synthesised from control `name`/`required` (algorithm "TBD"). Events on the form: `toolactivated`, `toolcanceled`; `SubmitEvent.agentInvoked` (boolean) and `SubmitEvent.respondWith(promise)`. **No `<meta>`/`<link>` discovery mechanism exists** in any WebMCP document — FACT (none in README, explainers or index.bs).

**Polyfills.** `@mcp-b/global` (polyfill + MCP bridge), `@mcp-b/webmcp-polyfill` (polyfill only), `@mcp-b/transports` (postMessage/iframe/extension), `@mcp-b/webmcp-extension` (MV3 template), `@mcp-b/react-webmcp`, `@mcp-b/webmcp-ts-sdk`, `@mcp-b/webmcp-local-relay`, `@mcp-b/smart-dom-reader`. Polyfills `document.modelContext`; self-described as "Not an official W3C or MCP project" (MCP-B) — FACT (https://github.com/WebMCP-org/npm-packages). No bare `webmcp` npm package was confirmed — UNVERIFIED. Several Chrome Web Store extensions ("WebMCP DevTools", "WebMCP Inspector") enumerate tools via `getTools()` — FACT-S.

## 2. MCP and remote-server discovery on websites

- **Real spec:** MCP Authorization requires servers to implement RFC 9728 Protected Resource Metadata (`/.well-known/oauth-protected-resource`), to return `401` with `WWW-Authenticate` pointing at `resource_metadata`, and auth servers to publish RFC 8414 metadata (`/.well-known/oauth-authorization-server`). The spec defines **no** `/.well-known/mcp`, `/.well-known/mcp.json` or `mcp.json` — FACT (https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-06-18/basic/authorization.mdx). Streamable HTTP uses a single endpoint (conventionally `/mcp`) taking JSON-RPC `POST` with `Accept: application/json, text/event-stream` and the `MCP-Protocol-Version` header — UNVERIFIED this session (transports page not fetched; https://modelcontextprotocol.io/specification/2025-06-18/basic/transports).
- **Proposal (in review):** SEP-2127 "MCP Server Cards – HTTP Server Discovery", opened 2026-01-21, status *In Review*, last activity 2026-09-28, successor of SEP-1649. Proposed paths: `/.well-known/mcp/server-card.json`, `/.well-known/mcp/server-cards.json`, plus `/.well-known/ai-catalog.json`. Card fields: `name` (reverse-DNS), `title`, `description`, `websiteUrl`, `repository`, `version`, `supportedProtocolVersions`, `remotes[]` (transport+auth), `resources/tools/prompts`. Early adopters named: GitHub, Buildkite — FACT (https://github.com/modelcontextprotocol/modelcontextprotocol/issues/2127). Secondary sources say the path has moved more than once (e.g. `<endpoint>/server-card`, `/.well-known/mcp/catalog.json`) — UNVERIFIED.
- **Proposal (expired):** `draft-serra-mcp-discovery-uri-04` (Marco Serra, Mumble Group, individual submission, 2026-03-25; expired 2026-09-27): `mcp:` URI scheme, `/.well-known/mcp-server` JSON manifest fetched with `Accept: application/json`, plus DNS TXT "fast mode" — FACT-S (https://datatracker.ietf.org/doc/draft-serra-mcp-discovery-uri/). A separate `draft-morrison-mcp-dns-discovery` exists — UNVERIFIED content.
- **MCP Registry** (registry.modelcontextprotocol.io, `server.json` manifests, preview Sept 2025) is a central catalogue, not a per-site file — FACT-S (https://glama.ai/blog/2025-10-26-the-model-context-protocol-registry-standardizing-server-discovery-in-a-decentralized-ecosystem).
- Non-standard paths seen in scanners/blogs (`/.well-known/mcp`, `/.well-known/mcp.json`, `/mcp.json`, `/.well-known/agents.json`): INFERENCE — folk conventions, no spec.

## 3. llms.txt

- **Spec** (Jeremy Howard / Answer.AI, v2 dated 2024-09-03, README last modified 2026-08-10): file at `/llms.txt` (root or any subpath, most specific wins). Order: optional BOM → **H1 (only required part)** → blockquote summary → free Markdown → H2 sections of `- [title](url): notes` → an `## Optional` section agents may skip. Clean-Markdown page convention: `page.html.md`, `page.md`, `index.html.md`/`index.md` — FACT (https://github.com/AnswerDotAI/llms-txt; mirrors https://llmstxt.org/).
- **`llms-full.txt`**: a community convention (single file holding the full concatenated docs) not defined in the spec text fetched — INFERENCE.
- **Adoption data:** Originality.ai (≈3M sites monitored): llms.txt 4,088 (Jun 2025) → 36,120 (May 2026, 8.8×); llms-full.txt 23 → 2,463; ai.txt 4 → 397 — FACT-S (https://ppc.land/llms-txt-adoption-rises-8-8x-but-97-of-files-get-zero-ai-requests/). SEOmator Sept 2026: 8,598 of top-100k domains (8.6%) — FACT-S (https://seomator.com/blog/llms-txt-adoption). BuiltWith: 781,685 live sites (broader method) — FACT-S (https://trends.builtwith.com/robots/LLMS-Text). Common Crawl July 2026 archive: 584,107 files analysed — FACT-S (https://commoncrawl.org/blog/a-content-analysis-of-llms-txt-files-from-the-july-2026-crawl-archive).
- **Usage evidence (negative):** Ahrefs, June 2026, 137k domains' logs: 28% publish llms.txt; **97% received zero requests in May 2026**; of requests that did occur 96% were bots, top fetchers GPTBot then `Claude-Code`; AI bots never request a non-existent llms.txt — FACT-S (https://ahrefs.com/blog/llmstxt-study/). Google's John Mueller (Bluesky, June 2025): "FWIW no AI system currently uses llms.txt." — FACT-S (https://seroundtable.com/google-ai-llms-txt-39607.html). No vendor (OpenAI, Google, Anthropic, Perplexity) documents consuming it — INFERENCE from vendor crawler docs, which only reference robots.txt.

## 4. AGENTS.md — repository instructions, not a website standard

"A simple, open format for guiding coding agents" (MIT, github.com/agentsmd/agents.md, site https://agents.md/) — FACT. OpenAI contributed it to the Linux Foundation's **Agentic AI Foundation** on 2025-12-09 (co-founded with Anthropic [MCP] and Block [goose]); "more than 60,000 open-source projects"; supported by Amp, Codex, Cursor, Devin, Factory, Gemini CLI, GitHub Copilot, Jules, VS Code — FACT-S (https://openai.com/index/agentic-ai-foundation/). It lives at a repo root (or nested dirs) and is read from the filesystem by coding agents; nothing defines serving it over HTTP — FACT. Related but separate: `draft-car-agents-txt-wellknown-00` (June 2026) proposes a well-known agents.txt — UNVERIFIED content.

## 5. robots.txt, AI user agents, bot identity, misc files

**Three classes** (INFERENCE from vendor docs): (a) training crawlers, (b) search/index crawlers, (c) user-triggered fetchers/agents that vendors say may ignore robots.txt.
| Vendor | Training | Search index | User-triggered | Source |
|---|---|---|---|---|
| OpenAI | `GPTBot` | `OAI-SearchBot` | `ChatGPT-User` ("robots.txt rules may not apply"); IPs openai.com/chatgpt-user.json | FACT-S https://developers.openai.com/docs/bots |
| Anthropic | `ClaudeBot` | `Claude-SearchBot` | `Claude-User`; IPs claude.com/crawling/bots.json; doc updated 2026-04-07 | FACT https://support.claude.com/en/articles/8896518-what-is-claude-bot |
| Google | `Google-Extended` (robots token only, no UA string; Gemini training + grounding) | Googlebot | `Google-Agent` (Mariner etc., "generally ignore robots.txt"), `GoogleAgent-Mariner`; experimenting with web-bot-auth identity `https://agent.bot.goog` | FACT-S https://searchenginejournal.com/google-agent-the-webs-new-visitor-just-got-an-identity/571508/ |
| Perplexity | — | `PerplexityBot` | `Perplexity-User` | FACT-S (docs.perplexity.ai/guides/bots) |
| Meta | `meta-externalagent` | `meta-webindexer` | `meta-externalfetcher` | FACT-S |
| Apple | `Applebot-Extended` (token) | `Applebot` | — | FACT-S |
| Others | `Bytespider`, `CCBot`, `Amazonbot`, `cohere-ai`, `MistralAI-Training` | `DuckAssistBot`, `Kimi-SearchBot` | `MistralAI-User`, `Claude-Code`, `Manus-User`, `Operator`, `Diffbot-User` | FACT list of 238 tokens: https://github.com/ai-robots-txt/ai.robots.txt |

**Web Bot Auth** (Cloudflare, RFC 9421 HTTP Message Signatures): agent sends `Signature-Agent: "https://<operator-origin>"`, `Signature-Input: sig1=("@authority" "signature-agent");created=…;expires=…;keyid=…;tag="web-bot-auth"`, `Signature: sig1=:…:`; verifier fetches Ed25519 JWKS from `https://<operator-origin>/.well-known/http-message-signatures-directory` — FACT for directory path + RFC 9421 (https://github.com/cloudflare/web-bot-auth), header details FACT-S (draft text egress-blocked; https://datatracker.ietf.org/doc/html/draft-meunier-web-bot-auth-architecture, rev -05, March 2026; companions `draft-meunier-webbotauth-httpsig-protocol-00` June 2026, `draft-meunier-http-message-signatures-directory`). All remain **individual drafts, not WG-adopted** — FACT-S (https://ppc.land/web-bot-auth/). Deployed: Cloudflare Verified Bots (2025-07-01) and "Signed Agents" (Browserbase, OpenAI, Manus sign; Vercel, Akamai, AWS WAF verify) — FACT-S/UNVERIFIED details. Note: the key directory is published by the **agent operator**, not by ordinary websites.

**Content Signals** (Cloudflare, Sept 2025, contentsignals.org): robots.txt line in a User-Agent group: `Content-Signal: search=yes, ai-input=no, ai-train=no` (signals: `search`, `ai-input` (RAG/grounding), `ai-train`); applied as `search=yes, ai-train=no` by default to ~3.8M Cloudflare managed-robots.txt domains — FACT-S (https://blog.cloudflare.com/content-signals-policy/, https://developers.cloudflare.com/bots/additional-configurations/managed-robots-txt/). Cloudflare also emits a `use=reference` token — UNVERIFIED.

**Other files:** `ai.txt` (Spawning, 2023; robots-like syntax; no major crawler documents honouring it) — FACT-S (https://contextbolt.com/blog/ai-txt/). `/.well-known/ai-plugin.json` — OpenAI ChatGPT-plugins manifest; plugins retired, presence is legacy — INFERENCE. `/.well-known/agent.json` — A2A pre-0.3 path, renamed to `/.well-known/agent-card.json` on 2025-07-30; A2A v1.0.0 registers it with IANA; A2A is a Linux Foundation project contributed by Google — FACT (https://github.com/a2aproject/A2A/blob/main/docs/specification.md) + FACT-S (https://aaif.io/blog/a2a-v1-0-a-builder-s-guide-part-1-discovery-tasks-and-clients). NLWeb (Microsoft, nlweb-ai/NLWeb): Schema.org/RSS-backed `/ask` REST + MCP endpoint, "AgentFinder" discovery module, no per-site well-known file — FACT (https://github.com/nlweb-ai/NLWeb). IAB: no agent-facing site file found — UNVERIFIED.

## 6. Schema.org and agentic-commerce protocols

- Schema.org types exist and are stable: `Product`, `Offer`, `FAQPage`, `Organization`, `ContactPoint`, `BreadcrumbList`, `WebSite` + `potentialAction: SearchAction` with `target: {"@type":"EntryPoint","urlTemplate":"…?q={search_term_string}"}, "query-input":"required name=search_term_string"` — FACT for SearchAction/FAQPage/ContactPoint/BreadcrumbList/EntryPoint (https://github.com/schemaorg/schemaorg/blob/main/data/schema.ttl); Product/Offer not reached in the truncated fetch (https://schema.org/Product). Relevance to agents: NLWeb and UCP catalogue flows consume Schema.org — INFERENCE.
- **OpenAI/Stripe Agentic Commerce Protocol (ACP):** Apache-2.0, founding maintainers OpenAI + Stripe, latest stable spec **2026-04-17** at `/spec/2026-04-17/` (OpenAPI + JSON Schema) covering Agentic Checkout (`POST /checkout_sessions`, `POST /checkout_sessions/{id}`, `…/complete`, `…/cancel`, `GET …/{id}`), Delegate Payment, Product Feed. Merchant discovery is by **feed submission to OpenAI, not a website file** — FACT (https://github.com/agentic-commerce-protocol/agentic-commerce-protocol; docs https://developers.openai.com/commerce). Announced 2025-09-29 (Etsy first); "Buy it in ChatGPT" to all US users 2026-02-16 — FACT-S.
- **Universal Commerce Protocol (UCP, Google + Shopify, announced NRF 2026-01-11):** Apache-2.0; discovery at **`/.well-known/ucp`**; profile requires `ucp.version` (RFC 3339 date, e.g. `2026-01-23`; `2026-04-08` also published), `ucp.services`, `ucp.payment_handlers`; plus `ucp.capabilities`, top-level `keys[]` JWKS; transports REST, MCP, A2A, Embedded; capability names reverse-domain (`dev.ucp.shopping.checkout`); AP2 mandates optional — FACT (https://github.com/Universal-Commerce-Protocol/ucp/blob/main/docs/specification/overview/index.md; https://ucp.dev/). Endorsers (Etsy, Wayfair, Target, Walmart, Stripe, Visa, Mastercard…) — FACT-S.
- **Google AP2 (Agent Payments Protocol, Sept 2025):** Apache-2.0; Intent/Cart/Payment Mandates (verifiable credentials); complementary to A2A/MCP; **no website discovery file** — FACT (https://github.com/google-agentic-commerce/AP2; https://ap2-protocol.org/).
- **Visa Trusted Agent Protocol (Visa Intelligent Commerce):** MIT, RFC 9421 signatures, Visa-run Agent Registry for agent keys (not the web-bot-auth directory); merchant verifies at CDN/edge — FACT (https://github.com/visa/trusted-agent-protocol; https://developer.visa.com/capabilities/trusted-agent-protocol). Launched Oct 2025 — UNVERIFIED.
- **Mastercard Agent Pay:** Agentic Tokens (MDES network tokens bound to agent + consent policy); announced 2025-04-29, developer preview Oct 2025 — UNVERIFIED (developer.mastercard.com egress-blocked). No merchant-side site file known — INFERENCE.
- **Shopify:** co-author of UCP; no separate Shopify "agentic checkout" spec was verified — UNVERIFIED.

## 7. Detection recipes for a scanner

**WebMCP — three independent signals (run all):**
1. *Declarative forms (static, reliable):* after load, `document.querySelectorAll('form[toolname]')`; for each, read `toolname`, `tooldescription`, `hasAttribute('toolautosubmit')`, and controls `[name]` → `{name, type, required, toolparamdescription}`. Also grep raw HTML for `toolname=` as a fallback for JS-rendered pages.
2. *Imperative registrations (requires a stub injected before page scripts):* with Playwright `context.addInitScript` / CDP `Page.addScriptToEvaluateOnNewDocument`:
```js
(() => { const reg = []; window.__webmcpCapture = reg;
  const mk = () => { const et = new EventTarget(); const mc = Object.assign(et, {
    registerTool: async (tool, opts={}) => { reg.push({ name: tool.name, title: tool.title, description: tool.description,
        inputSchema: tool.inputSchema, annotations: tool.annotations, exposedTo: opts.exposedTo, hasExecute: typeof tool.execute==='function' }); },
    getTools: async () => reg.map(t => ({...t, origin: location.origin})),
    executeTool: async () => { throw new Error('scanner stub'); },
    resumeTool: () => {}, provideContext: ({tools=[]}={}) => tools.forEach(t => mc.registerTool(t)), clearContext: () => { reg.length = 0; },
    ontoolchange: null, ontoolactivated: null, ontoolcancel: null }); return mc; };
  const stub = mk(); const stubLegacy = stub;
  if (!('modelContext' in document))  Object.defineProperty(document,  'modelContext', { value: stub,       configurable: true });
  if (!('modelContext' in navigator)) Object.defineProperty(navigator, 'modelContext', { value: stubLegacy, configurable: true });
})();
```
   Then after `networkidle` + a grace period: `page.evaluate(() => window.__webmcpCapture)`. Keep the legacy `navigator.*` and `provideContext` shims because most 2025–mid-2026 tutorials used them (INFERENCE). Record `document.modelContext === stub` to tell "stub captured" from "native API present".
3. *Native presence / tooling:* `'modelContext' in document` without the stub is true only in Chrome/Edge ≥149/150 with an OT token or `--enable-features` flag; run the scanner browser with `chrome://flags/#enable-webmcp-testing` equivalent (`--enable-features=WebMCPTesting` — UNVERIFIED flag id) and call `await document.modelContext.getTools()` (returns `RegisteredTool[]` with `name/description/inputSchema/origin`). Also check `<meta http-equiv="origin-trial" content="…">` / `Origin-Trial` response header and decode the token payload (`feature` field) for a WebMCP trial — INFERENCE.
4. *Polyfill fingerprints:* script URLs or bundle text containing `@mcp-b/`, `webmcp-polyfill`, `mcp-b/global` — INFERENCE.

**MCP:** `GET /.well-known/mcp/server-card.json` (SEP-2127), `/.well-known/mcp/server-cards.json`, `/.well-known/ai-catalog.json`; legacy/folk: `/.well-known/mcp-server` (draft-serra), `/.well-known/mcp.json`, `/.well-known/mcp`, `/mcp.json`. Probe `POST /mcp` (and `/sse`) with JSON-RPC `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"scanner","version":"0"}}}`, headers `Accept: application/json, text/event-stream`, `Content-Type: application/json`; a `401` with `WWW-Authenticate: Bearer resource_metadata="…"` or a `200` JSON-RPC result is a positive; also `GET /.well-known/oauth-protected-resource` (RFC 9728) returning JSON with `resource` + `authorization_servers` strongly implies an MCP resource server. Grade spec-defined (RFC 9728) > SEP-2127 > folk paths.

**llms.txt:** `GET /llms.txt` with `Accept: text/plain, text/markdown`; validate: non-HTML body, first non-empty line starts with `# `, optional `> ` blockquote, `## ` sections with `- [..](..)` links, `## Optional`. Also `GET /llms-full.txt`; sample 2–3 linked URLs with `.md` appended (`/docs/page.md`, `/index.html.md`) to test the Markdown-page convention. Report as "published", never as "used by AI".

**AGENTS.md:** do **not** probe websites; only flag if `GET /AGENTS.md` returns Markdown and label it "repo convention served over HTTP (non-standard)".

**robots.txt:** parse groups; classify tokens with the table above into train/search/user-fetch; flag absent groups as "default allow". Detect `Content-Signal:` lines (case-insensitive, `key=yes|no` pairs: `search`, `ai-input`, `ai-train`). Also fetch `/ai.txt` (legacy Spawning), `/.well-known/ai-plugin.json` (legacy), `/.well-known/agent-card.json` (A2A; validate `name`, `description`, `version`, `supportedInterfaces` or legacy `url`, `skills`), `/.well-known/agent.json` (legacy A2A), `/.well-known/http-message-signatures-directory` (only meaningful if the site is itself an agent operator; expect `application/http-message-signatures-directory+json` JWKS — media type UNVERIFIED). Web Bot Auth *acceptance* by a site cannot be detected passively; optionally send a self-signed `Signature-Agent` request and compare responses (INFERENCE).

**Structured data:** collect `script[type="application/ld+json"]` + Microdata/RDFa; flatten `@graph`; report counts by `@type` for `Organization`, `WebSite` (+`potentialAction.@type=="SearchAction"` with `target.urlTemplate` and `query-input`), `Product`/`Offer` (`price`, `priceCurrency`, `availability`), `FAQPage`, `ContactPoint`, `BreadcrumbList`.

**Commerce:** `GET /.well-known/ucp` (JSON; require `ucp.version`, `ucp.services`, `ucp.payment_handlers`; list `ucp.capabilities` names and transports); ACP has **no** site-level marker — can only detect merchant-implemented endpoints if the site exposes `POST /checkout_sessions` (do not probe destructively; a `405/401` on `OPTIONS`/`GET` is weak evidence, INFERENCE); AP2/Visa TAP/Mastercard Agent Pay have no site-level file.

## 8. Primary sources opened this session
webmachinelearning/webmcp (README, index.bs, declarative-api-explainer.md, implementation-status.md, continuations-explainer.md); WebMCP-org/npm-packages; modelcontextprotocol spec authorization.mdx; MCP SEP-2127 issue; AnswerDotAI/llms-txt README; agentsmd/agents.md; cloudflare/web-bot-auth; ai-robots-txt/ai.robots.txt; support.claude.com bot article; a2aproject/A2A spec + README; nlweb-ai/NLWeb; agentic-commerce-protocol repo; Universal-Commerce-Protocol/ucp overview; google-agentic-commerce/AP2; visa/trusted-agent-protocol; schemaorg schema.ttl. Egress-blocked (used via search snippets only): developer.chrome.com, chromestatus, groups.google.com, datatracker/ietf mirrors, llmstxt.org, agents.md, openai.com, blog/developers.cloudflare.com, contentsignals.org, ahrefs, commoncrawl, seroundtable, ucp.dev, ap2-protocol.org, developer.mastercard.com, docs.perplexity.ai, schema.org.
