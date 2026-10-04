import { describe, expect, it } from 'vitest';
import { EXPANSIONS, keywordsFromGoal, matchScore } from '../../src/tasks/keywords.js';

describe('keywordsFromGoal', () => {
  it('drops stopwords and short words, keeps content words', () => {
    const kw = keywordsFromGoal('Find the page about shipping to Portugal');
    expect(kw).not.toContain('find');
    expect(kw).not.toContain('the');
    expect(kw).not.toContain('page');
    expect(kw).not.toContain('about');
    expect(kw).not.toContain('to');
    expect(kw).toContain('shipping');
    expect(kw).toContain('portugal');
  });

  it('expands known vocabulary with synonyms', () => {
    const kw = keywordsFromGoal('Open the privacy policy.');
    for (const e of EXPANSIONS.privacy ?? []) expect(kw).toContain(e);
    for (const e of EXPANSIONS.policy ?? []) expect(kw).toContain(e);
    expect(kw).toContain('terms');
    expect(kw).toContain('legal');
  });

  it('matches prefix stems such as "contacting" -> contact', () => {
    const kw = keywordsFromGoal('Find the email address for contacting Northwind Bikes.');
    expect(kw).toContain('contacting');
    expect(kw).toContain('contact');
    expect(kw).toContain('contact us');
    expect(kw).toContain('get in touch');
    expect(kw).toContain('email');
    expect(kw).toContain('phone');
  });

  it('matches stems in both directions only for words of 5+ characters', () => {
    // "prices" (6) starts with key "price" -> expanded; "cart" (4) only matches the exact key
    expect(keywordsFromGoal('Compare prices')).toContain('pricing');
    expect(keywordsFromGoal('Open the cart')).toContain('basket');
    // "docs" is exactly a key -> expanded even though it is 4 chars
    expect(keywordsFromGoal('Read the docs')).toContain('documentation');
  });

  it('excludes words that name the site itself', () => {
    const kw = keywordsFromGoal(
      'Find the email address for contacting Northwind Bikes.',
      [],
      'Home | Northwind Bikes',
    );
    expect(kw).not.toContain('northwind');
    expect(kw).not.toContain('bikes');
    expect(kw).toContain('email');
  });

  it('keeps site-title words shorter than three characters out of the exclusion set', () => {
    // "go" in the title is too short to be an exclusion; "go" in the goal is a stopword anyway
    const kw = keywordsFromGoal('Find store hours', [], 'Go Store');
    expect(kw).not.toContain('store');
    expect(kw).toContain('hours');
  });

  it('prepends normalised hints and de-duplicates', () => {
    const kw = keywordsFromGoal('Find the return window', ['  RETURNS ', 'Devoluções']);
    expect(kw[0]).toBe('returns');
    expect(kw[1]).toBe('devolucoes');
    expect(kw.filter((k) => k === 'returns')).toHaveLength(1);
    expect(kw).toContain('refund');
  });

  it('strips possessives and punctuation', () => {
    const kw = keywordsFromGoal("Find the company's pricing page!");
    expect(kw).toContain('pricing');
    expect(kw).not.toContain("company's");
    expect(kw).not.toContain('company');
  });

  it('normalises accents in the goal', () => {
    const kw = keywordsFromGoal('Encontrar a política de devolução');
    expect(kw).toContain('politica');
    expect(kw).toContain('devolucao');
  });

  it('never returns empty strings', () => {
    expect(keywordsFromGoal('   ', ['', '  '])).toEqual([]);
  });
});

describe('matchScore', () => {
  const kw = ['contact', 'email'];

  it('ranks exact name > whole word > substring > prefix stem', () => {
    const exact = matchScore('Contact', undefined, kw);
    const word = matchScore('Contact us', undefined, kw);
    const sub = matchScore('Contacts', undefined, kw);
    const stem = matchScore('Contacting the team', undefined, ['conta']);
    const none = matchScore('About', undefined, kw);
    expect(exact).toBe(5);
    expect(word).toBe(3);
    expect(sub).toBe(2);
    expect(stem).toBe(2);
    expect(none).toBe(0);
    expect(exact).toBeGreaterThan(word);
    expect(word).toBeGreaterThan(sub);
  });

  it('adds one point per keyword found in the URL', () => {
    expect(matchScore('Get in touch', 'contact.html', kw)).toBe(1);
    expect(matchScore('Contact', '/contact-email/', kw)).toBe(5 + 1 + 1);
  });

  it('sums over keywords and normalises the name', () => {
    expect(matchScore('EMAIL contact', undefined, kw)).toBe(6);
    expect(matchScore('Contacto', undefined, ['contacto'])).toBe(5);
  });

  it('returns 0 for empty inputs and ignores empty keywords', () => {
    expect(matchScore('', undefined, kw)).toBe(0);
    expect(matchScore('', '', kw)).toBe(0);
    expect(matchScore('Contact', undefined, ['', 'contact'])).toBe(5);
  });

  it('only applies the stem rule to words of 4+ characters', () => {
    // "car" (3) is a substring of "cart" so the substring rule still fires
    expect(matchScore('Cart', undefined, ['car'])).toBe(2);
    // keyword longer than the name word: only the stem rule can match, and "car" is too short
    expect(matchScore('Car', undefined, ['cart'])).toBe(0);
    expect(matchScore('Cart', undefined, ['carts'])).toBe(2);
  });
});
