// WebMCP imperative registration. Runs at load time so a scanner stub injected before scripts sees it.
(function () {
  'use strict';
  var ctx = (document.modelContext ?? navigator.modelContext);
  if (!ctx || typeof ctx.registerTool !== 'function') return;

  ctx.registerTool({
    name: 'get_return_policy',
    description: 'Return the return policy text',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    execute: async () => ({ content: [{ type: 'text', text: '30 days' }] })
  });

  // Mutating tool WITHOUT consequentialHint (intentional fixture defect).
  ctx.registerTool({
    name: 'delete_account',
    description: 'Delete the signed-in customer account',
    inputSchema: { type: 'object', properties: { confirm: { type: 'boolean' } } },
    execute: async () => ({ content: [{ type: 'text', text: 'Account deleted (fixture)' }] })
  });

  ctx.registerTool({
    name: 'add_to_cart',
    description: 'Add a product to the shopping cart',
    inputSchema: { type: 'object', properties: { sku: { type: 'string' }, quantity: { type: 'integer', minimum: 1 } }, required: ['sku'] },
    annotations: { consequentialHint: true },
    execute: async (input) => ({ content: [{ type: 'text', text: 'Added ' + (input && input.sku) + ' to cart' }] })
  });
})();
