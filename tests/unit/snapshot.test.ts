import { describe, expect, it } from 'vitest';
import {
  ancestors,
  buildSnapshot,
  descendantText,
  describe as describeNode,
  hasAncestorRole,
  INTERACTIVE_ROLES,
  interactiveNodes,
  NAME_REQUIRED_ROLES,
  truncateSnapshot,
} from '../../src/browser/snapshot.js';

/** Shape of page.ariaSnapshotJSON({ mode: 'ai' }) for a small page with an iframe. */
const RAW = [
  {
    role: 'generic',
    active: true,
    ref: 'e1',
    children: [
      {
        role: 'banner',
        ref: 'e2',
        children: [
          // <a href><strong>Northwind Bikes</strong></a>: the link has no name of its own
          {
            role: 'link',
            ref: 'e3',
            cursor: 'pointer',
            url: 'index.html',
            children: [{ role: 'strong', ref: 'e4', text: 'Northwind Bikes' }],
          },
          {
            role: 'navigation',
            name: 'Main',
            ref: 'e5',
            children: [
              {
                role: 'list',
                ref: 'e6',
                children: [
                  {
                    role: 'listitem',
                    ref: 'e7',
                    children: [
                      { role: 'link', name: '  Contact ', ref: 'e8', url: 'contact.html' },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        role: 'main',
        ref: 'e9',
        children: [
          { role: 'heading', name: 'Bikes', level: 1, ref: 'e10' },
          { role: 'paragraph', ref: 'e11', text: 'We sell bikes.' },
          { role: 'button', name: 'Add to cart', ref: 'e12', disabled: true },
          { role: 'checkbox', name: 'Gift wrap', ref: 'e13', checked: true },
          // unnamed textbox without children: name stays empty
          { role: 'textbox', ref: 'e14' },
          // nameless button with icon child and a nested span: name derived from descendants
          {
            role: 'button',
            ref: 'e15',
            children: [
              { role: 'img', name: 'cart icon', ref: 'e16' },
              { role: 'generic', ref: 'e17', children: [{ role: 'text', text: '(2 items)' }] },
            ],
          },
          // interactive without ref (e.g. hidden): excluded from interactiveNodes
          { role: 'link', name: 'No ref', url: 'x.html' },
          {
            role: 'iframe',
            ref: 'e18',
            children: [
              {
                role: 'generic',
                ref: 'f1e1',
                children: [{ role: 'button', name: 'Pay now', ref: 'f1e2' }],
              },
            ],
          },
        ],
      },
    ],
  },
];

const TEXT = '- generic [active] [ref=e1]:\n  - banner [ref=e2]:\n';

describe('buildSnapshot', () => {
  const snap = buildSnapshot(RAW, TEXT);

  it('keeps the raw text and its length', () => {
    expect(snap.text).toBe(TEXT);
    expect(snap.chars).toBe(TEXT.length);
  });

  it('converts roots and produces a pre-order node list with parents and depths', () => {
    expect(snap.roots).toHaveLength(1);
    expect(snap.nodes[0]?.ref).toBe('e1');
    expect(snap.nodes[0]?.depth).toBe(0);
    expect(snap.nodes[0]?.parent).toBeUndefined();
    const order = snap.nodes.map((n) => n.ref ?? `(${n.role})`);
    expect(order.slice(0, 6)).toEqual(['e1', 'e2', 'e3', 'e4', 'e5', 'e6']);
    const contact = snap.nodes.find((n) => n.ref === 'e8');
    expect(contact?.depth).toBe(5);
    expect(contact?.parent?.ref).toBe('e7');
    expect(ancestors(contact as NonNullable<typeof contact>).map((a) => a.ref)).toEqual([
      'e7',
      'e6',
      'e5',
      'e2',
      'e1',
    ]);
    expect(hasAncestorRole(contact as NonNullable<typeof contact>, 'navigation')).toBe(true);
    expect(hasAncestorRole(contact as NonNullable<typeof contact>, 'main')).toBe(false);
  });

  it('copies attributes and trims names', () => {
    const byRef = (r: string) => snap.nodes.find((n) => n.ref === r);
    expect(byRef('e8')).toMatchObject({ role: 'link', name: 'Contact', url: 'contact.html' });
    expect(byRef('e10')).toMatchObject({ role: 'heading', name: 'Bikes', level: 1 });
    expect(byRef('e11')).toMatchObject({ role: 'paragraph', name: '', text: 'We sell bikes.' });
    expect(byRef('e12')).toMatchObject({ disabled: true });
    expect(byRef('e13')).toMatchObject({ checked: true });
    expect(byRef('e1')).toMatchObject({ active: true });
    expect(byRef('e3')?.cursor).toBe('pointer');
  });

  it('defaults a missing role to generic and tolerates non-array input', () => {
    const s = buildSnapshot([{ ref: 'e1', children: [{ name: 'x' }] }], '');
    expect(s.nodes.map((n) => n.role)).toEqual(['generic', 'generic']);
    expect(buildSnapshot(null, '').nodes).toEqual([]);
    expect(buildSnapshot({ role: 'link' }, '').roots).toEqual([]);
  });

  it('derives names for nameless interactive nodes from descendant text and flags it', () => {
    const brand = snap.nodes.find((n) => n.ref === 'e3');
    expect(brand?.name).toBe('Northwind Bikes');
    expect(brand?.nameFromDescendants).toBe(true);
    const cartButton = snap.nodes.find((n) => n.ref === 'e15');
    expect(cartButton?.name).toBe('cart icon (2 items)');
    expect(cartButton?.nameFromDescendants).toBe(true);
    // named nodes and childless unnamed nodes are left alone
    expect(snap.nodes.find((n) => n.ref === 'e8')?.nameFromDescendants).toBeUndefined();
    const textbox = snap.nodes.find((n) => n.ref === 'e14');
    expect(textbox?.name).toBe('');
    expect(textbox?.nameFromDescendants).toBeUndefined();
    // non-interactive containers never get a derived name
    expect(snap.nodes.find((n) => n.ref === 'e2')?.name).toBe('');
  });

  it('records the frame prefix for refs such as f1e2', () => {
    const pay = snap.nodes.find((n) => n.ref === 'f1e2');
    expect(pay?.frame).toBe('f1');
    expect(snap.nodes.find((n) => n.ref === 'f1e1')?.frame).toBe('f1');
    expect(snap.nodes.find((n) => n.ref === 'e8')?.frame).toBeUndefined();
    expect(hasAncestorRole(pay as NonNullable<typeof pay>, 'iframe')).toBe(true);
  });

  it('descendantText joins names and texts of descendants only', () => {
    const main = snap.nodes.find((n) => n.ref === 'e9') as NonNullable<(typeof snap.nodes)[0]>;
    const t = descendantText(main);
    expect(t).toContain('Bikes We sell bikes. Add to cart Gift wrap');
    expect(t).toContain('Pay now');
    expect(t.startsWith('Bikes')).toBe(true);
  });
});

describe('interactiveNodes', () => {
  const snap = buildSnapshot(RAW, TEXT);

  it('returns interactive roles that carry a ref, in document order, across frames', () => {
    const refs = interactiveNodes(snap).map((n) => `${n.role}:${n.ref}`);
    expect(refs).toEqual([
      'link:e3',
      'link:e8',
      'button:e12',
      'checkbox:e13',
      'textbox:e14',
      'button:e15',
      'button:f1e2',
    ]);
  });

  it('excludes interactive nodes without a ref and non-interactive nodes', () => {
    const list = interactiveNodes(snap);
    expect(list.some((n) => n.name === 'No ref')).toBe(false);
    expect(list.some((n) => n.role === 'heading' || n.role === 'img')).toBe(false);
  });

  it('role sets are consistent: every name-required role is interactive', () => {
    for (const r of NAME_REQUIRED_ROLES) expect(INTERACTIVE_ROLES.has(r)).toBe(true);
    expect(INTERACTIVE_ROLES.has('option')).toBe(true);
    expect(NAME_REQUIRED_ROLES.has('option')).toBe(false);
  });
});

describe('describe and truncateSnapshot', () => {
  const snap = buildSnapshot(RAW, TEXT);

  it('describe renders role, quoted name, ref, url and cursor', () => {
    const contact = snap.nodes.find((n) => n.ref === 'e8');
    expect(describeNode(contact as NonNullable<typeof contact>)).toBe(
      'link "Contact" [ref=e8] → contact.html',
    );
    const brand = snap.nodes.find((n) => n.ref === 'e3');
    expect(describeNode(brand as NonNullable<typeof brand>)).toBe(
      'link "Northwind Bikes" [ref=e3] → index.html [cursor=pointer]',
    );
    const para = snap.nodes.find((n) => n.ref === 'e11');
    expect(describeNode(para as NonNullable<typeof para>)).toBe(
      'paragraph [ref=e11] : We sell bikes.',
    );
  });

  it('truncateSnapshot leaves short text alone and appends a marker otherwise', () => {
    expect(truncateSnapshot('abc', 10)).toBe('abc');
    expect(truncateSnapshot('abcdefghij', 10)).toBe('abcdefghij');
    expect(truncateSnapshot('abcdefghijk', 10)).toBe('abcdefghij\n… [truncated 1 chars]');
  });
});
