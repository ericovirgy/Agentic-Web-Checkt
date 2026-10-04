import { normaliseText } from './assertions.js';

const STOPWORDS = new Set(
  'a an the of for to in on at by with and or is are be find locate open go get page site website company companys their its this that what where how which show me please information info details about describing'.split(
    ' ',
  ),
);

/** Synonym expansion for common agent goals (accessible-name vocabulary). */
export const EXPANSIONS: Record<string, string[]> = {
  contact: ['contact', 'contact us', 'get in touch', 'email', 'phone', 'support', 'contacto'],
  return: ['return', 'returns', 'refund', 'refunds', 'policy', 'exchange', 'devolu'],
  returns: ['return', 'returns', 'refund', 'refunds', 'policy', 'devolu'],
  refund: ['refund', 'returns', 'return policy'],
  policy: ['policy', 'policies', 'terms', 'legal'],
  privacy: ['privacy', 'privacidade', 'legal'],
  terms: ['terms', 'conditions', 'legal', 'termos'],
  price: ['price', 'pricing', 'plans', 'cost', 'preço'],
  pricing: ['pricing', 'plans', 'price', 'preços', 'planos'],
  product: ['product', 'products', 'shop', 'store', 'catalog', 'catalogue', 'produtos', 'loja'],
  products: ['products', 'shop', 'store', 'catalog', 'catalogue', 'produtos'],
  search: ['search', 'find', 'pesquis', 'procurar'],
  help: ['help', 'support', 'faq', 'docs', 'documentation', 'ajuda'],
  about: ['about', 'company', 'who we are', 'sobre'],
  login: ['login', 'log in', 'sign in', 'account', 'entrar'],
  account: ['account', 'my account', 'profile', 'members', 'conta'],
  cart: ['cart', 'basket', 'bag', 'carrinho'],
  shipping: ['shipping', 'delivery', 'envio', 'entrega'],
  docs: ['docs', 'documentation', 'guide', 'reference'],
  careers: ['careers', 'jobs', 'join', 'hiring'],
};

export function keywordsFromGoal(goal: string, hints: string[] = [], siteTitle = ''): string[] {
  // Words that name the site itself (from its title) match every logo/home link and are excluded.
  const titleWords = new Set(
    normaliseText(siteTitle)
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
  const words = normaliseText(goal)
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/'s$/, ''))
    .filter((w) => w.length > 2 && !STOPWORDS.has(w) && !titleWords.has(w));
  const out = new Set<string>(hints.map(normaliseText));
  for (const w of words) {
    out.add(w);
    for (const [key, list] of Object.entries(EXPANSIONS)) {
      if (
        w === key ||
        (w.length >= 5 && key.length >= 4 && (w.startsWith(key) || key.startsWith(w)))
      )
        for (const e of list) out.add(e);
    }
  }
  return [...out].filter(Boolean);
}

/** Score how well an accessible name (and optional URL) matches the keyword set. */
export function matchScore(name: string, url: string | undefined, keywords: string[]): number {
  const n = normaliseText(name);
  const u = normaliseText(url ?? '').replace(/[-_/]/g, ' ');
  if (!n && !u) return 0;
  let score = 0;
  const nameWords = n.split(' ');
  for (const k of keywords) {
    if (!k) continue;
    if (n === k) score += 5;
    else if (nameWords.includes(k)) score += 3;
    else if (n.includes(k)) score += 2;
    else if (
      nameWords.some((w) => w.length >= 4 && k.length >= 4 && (w.startsWith(k) || k.startsWith(w)))
    )
      score += 2;
    if (u.includes(k)) score += 1;
  }
  return score;
}
