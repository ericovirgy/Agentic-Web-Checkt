/**
 * Script injected into every page before any site script runs. It records facts that are
 * invisible after the fact: closed shadow roots, click listeners on non-semantic elements,
 * WebMCP tool registrations, DOM mutation rate and layout shifts.
 *
 * Everything is stored on `window.__awc` and read back with `page.evaluate`.
 */
export const INIT_SCRIPT = `
(() => {
  if (window.__awc) return;
  const state = {
    closedShadowRoots: 0,
    closedShadowHosts: [],
    clickListeners: new WeakSet(),
    clickListenerCount: 0,
    webmcp: { tools: [], api: null, calls: 0 },
    mutations: 0,
    mutationsAfterSettle: 0,
    settled: false,
    cls: 0,
    errors: [],
  };
  Object.defineProperty(window, '__awc', { value: state, enumerable: false });

  // 1. Closed shadow roots
  const origAttach = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function (init) {
    const root = origAttach.call(this, init);
    if (init && init.mode === 'closed') {
      state.closedShadowRoots++;
      if (state.closedShadowHosts.length < 20) {
        state.closedShadowHosts.push(this.tagName.toLowerCase() + (this.id ? '#' + this.id : ''));
      }
      try { this.__awcClosedRoot = root; } catch {}
    }
    return root;
  };

  // 2. Click listeners on elements
  const origAdd = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, listener, options) {
    if ((type === 'click' || type === 'mousedown' || type === 'pointerdown') && this instanceof Element) {
      if (!state.clickListeners.has(this)) {
        state.clickListeners.add(this);
        state.clickListenerCount++;
      }
    }
    return origAdd.call(this, type, listener, options);
  };

  // 3. WebMCP capture (document.modelContext is current; navigator.modelContext is deprecated)
  const makeStub = (apiName) => {
    const tools = state.webmcp.tools;
    const stub = {
      registerTool(tool, opts) {
        state.webmcp.calls++;
        state.webmcp.api = state.webmcp.api || apiName;
        try {
          tools.push({
            name: String(tool && tool.name || ''),
            description: String(tool && tool.description || ''),
            inputSchema: tool && tool.inputSchema ? JSON.parse(JSON.stringify(tool.inputSchema)) : null,
            annotations: tool && tool.annotations ? JSON.parse(JSON.stringify(tool.annotations)) : null,
            hasExecute: typeof (tool && tool.execute) === 'function',
            via: apiName,
          });
        } catch (e) { tools.push({ name: 'unserialisable', description: String(e), via: apiName }); }
        return { unregister() {}, [Symbol.dispose]() {} };
      },
      // legacy surface
      provideContext(ctx) {
        state.webmcp.calls++;
        state.webmcp.api = state.webmcp.api || apiName + ' (legacy provideContext)';
        const list = (ctx && ctx.tools) || [];
        for (const t of list) stub.registerTool(t);
      },
      unregisterTool() {},
      clearContext() {},
      getTools() { return tools.slice(); },
      executeTool() { return Promise.reject(new Error('stub')); },
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() { return false; },
    };
    return stub;
  };
  const define = (target, apiName) => {
    try {
      if (!(apiName.split('.')[1] in target)) {
        Object.defineProperty(target, apiName.split('.')[1], { value: makeStub(apiName), configurable: true, enumerable: false });
        return true;
      }
    } catch {}
    return false;
  };
  const d = define(document, 'document.modelContext');
  const n = define(navigator, 'navigator.modelContext');
  state.webmcp.native = !(d && n);

  // 4. Mutations and layout shifts
  const start = () => {
    try {
      const mo = new MutationObserver((list) => {
        state.mutations += list.length;
        if (state.settled) state.mutationsAfterSettle += list.length;
      });
      mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    } catch {}
    try {
      const po = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) { if (!e.hadRecentInput) state.cls += e.value; }
      });
      po.observe({ type: 'layout-shift', buffered: true });
    } catch {}
  };
  if (document.documentElement) start(); else document.addEventListener('DOMContentLoaded', start, { once: true });
  window.addEventListener('error', (e) => { if (state.errors.length < 50) state.errors.push(String(e.message || e)); });
})();
`;
