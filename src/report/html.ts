import type { ScanResult } from '../types.js';

export function renderHtml(result: ScanResult): string {
  // Placeholder replaced by the full report renderer (src/report/html-template.ts).
  return `<!doctype html><title>Agentic Web Check</title><pre>${escapeHtml(JSON.stringify(result, null, 2))}</pre>`;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
