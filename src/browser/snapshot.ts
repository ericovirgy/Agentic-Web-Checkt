/**
 * Accessibility snapshot model. Built from Playwright's `page.ariaSnapshotJSON({ mode: 'ai' })`,
 * which is the same representation Playwright MCP feeds to agents (refs resolve via `aria-ref=`).
 */

export interface SnapshotNode {
  role: string;
  name: string;
  ref?: string;
  level?: number;
  url?: string;
  text?: string;
  cursor?: string;
  disabled?: boolean;
  checked?: boolean | 'mixed';
  selected?: boolean;
  expanded?: boolean;
  pressed?: boolean | 'mixed';
  active?: boolean;
  children: SnapshotNode[];
  parent?: SnapshotNode;
  depth: number;
  /** Frame prefix (e.g. "f1") when the node lives in an iframe. */
  frame?: string;
  /** Name was empty in the snapshot and derived from descendant text. */
  nameFromDescendants?: boolean;
}

export function descendantText(n: SnapshotNode): string {
  const parts: string[] = [];
  const walk = (x: SnapshotNode) => {
    if (x !== n && (x.name || x.text)) parts.push(x.name || x.text || '');
    for (const c of x.children) walk(c);
  };
  walk(n);
  return parts.join(' ').replace(/\s+/g, ' ');
}

export const INTERACTIVE_ROLES = new Set([
  'button',
  'link',
  'textbox',
  'searchbox',
  'combobox',
  'listbox',
  'option',
  'checkbox',
  'radio',
  'switch',
  'slider',
  'spinbutton',
  'tab',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'treeitem',
]);

/** Roles whose accessible name is required for an agent to pick them. */
export const NAME_REQUIRED_ROLES = new Set([
  'button',
  'link',
  'textbox',
  'searchbox',
  'combobox',
  'listbox',
  'checkbox',
  'radio',
  'switch',
  'slider',
  'spinbutton',
  'tab',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'treeitem',
]);

export interface Snapshot {
  roots: SnapshotNode[];
  /** Pre-order list of all nodes. */
  nodes: SnapshotNode[];
  text: string;
  chars: number;
}

interface RawNode {
  role?: string;
  name?: string;
  ref?: string;
  level?: number;
  url?: string;
  text?: string;
  cursor?: string;
  disabled?: boolean;
  checked?: boolean | 'mixed';
  selected?: boolean;
  expanded?: boolean;
  pressed?: boolean | 'mixed';
  active?: boolean;
  children?: RawNode[];
}

export function buildSnapshot(raw: unknown, text: string): Snapshot {
  const nodes: SnapshotNode[] = [];
  const roots = Array.isArray(raw) ? (raw as RawNode[]) : [];
  const convert = (r: RawNode, parent: SnapshotNode | undefined, depth: number): SnapshotNode => {
    const node: SnapshotNode = {
      role: r.role ?? 'generic',
      name: (r.name ?? '').trim(),
      ref: r.ref,
      level: r.level,
      url: r.url,
      text: r.text,
      cursor: r.cursor,
      disabled: r.disabled,
      checked: r.checked,
      selected: r.selected,
      expanded: r.expanded,
      pressed: r.pressed,
      active: r.active,
      children: [],
      parent,
      depth,
      frame: r.ref?.match(/^(f\d+)e\d+$/)?.[1],
    };
    nodes.push(node);
    node.children = (r.children ?? []).map((c) => convert(c, node, depth + 1));
    return node;
  };
  const rootNodes = roots.map((r) => convert(r, undefined, 0));
  // Playwright exposes <strong>/<em>/<code> inside a control as child nodes and leaves the control
  // unnamed; agents still see the text, so derive the name from descendants (tracked in nameFromDescendants).
  for (const n of nodes) {
    if (!n.name && INTERACTIVE_ROLES.has(n.role) && n.children.length) {
      const derived = descendantText(n).trim();
      if (derived) {
        n.name = derived;
        n.nameFromDescendants = true;
      }
    }
  }
  return { roots: rootNodes, nodes, text, chars: text.length };
}

export function interactiveNodes(s: Snapshot): SnapshotNode[] {
  return s.nodes.filter((n) => INTERACTIVE_ROLES.has(n.role) && n.ref);
}

export function ancestors(n: SnapshotNode): SnapshotNode[] {
  const out: SnapshotNode[] = [];
  let p = n.parent;
  while (p) {
    out.push(p);
    p = p.parent;
  }
  return out;
}

export function hasAncestorRole(n: SnapshotNode, role: string): boolean {
  return ancestors(n).some((a) => a.role === role);
}

export function describe(n: SnapshotNode): string {
  const bits = [n.role];
  if (n.name) bits.push(JSON.stringify(n.name));
  if (n.ref) bits.push(`[ref=${n.ref}]`);
  if (n.url) bits.push(`→ ${n.url}`);
  if (n.cursor) bits.push(`[cursor=${n.cursor}]`);
  if (n.text && !n.name) bits.push(`: ${n.text.slice(0, 60)}`);
  return bits.join(' ');
}

/** Serialise the snapshot to the YAML text form, bounded, for evidence/LLM prompts. */
export function truncateSnapshot(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n… [truncated ${text.length - maxChars} chars]`;
}
