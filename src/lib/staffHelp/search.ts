import { STAFF_HELP_INDEX, type HelpEntry, type AppRole } from './help-index';

export interface SearchResult {
  entry: HelpEntry;
  score: number;
  matched: 'title' | 'page' | 'keywords' | 'breadcrumb' | 'steps';
}

function normalize(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(query: string): Set<string> {
  return new Set(normalize(query).split(' ').filter(Boolean));
}

function scoreTokens(tokens: Set<string>, haystack: string, multiplier = 1): number {
  const hay = normalize(haystack);
  if (!hay || tokens.size === 0) return 0;

  let score = 0;
  const fullHay = haystack.toLowerCase();

  for (const token of tokens) {
    if (fullHay.includes(token)) {
      // Exact substring match within the full field is worth more than token presence.
      score += 1.5 * multiplier;

      // Count occurrences within normalized haystack.
      const matches = hay.split(' ').filter(word => word.includes(token)).length;
      score += 0.2 * matches * multiplier;
    }
  }

  // Bonus for full query matching exactly as a substring.
  const q = Array.from(tokens).join(' ');
  if (fullHay.includes(q)) {
    score += 2 * multiplier;
  }

  return score;
}

export function searchHelp(query: string, role: AppRole | null): SearchResult[] {
  const q = query.trim();
  if (!q) return [];

  const tokens = tokenSet(q);
  const results: SearchResult[] = [];

  for (const entry of STAFF_HELP_INDEX) {
    // Audience filter: entries must be viewable by the current role or be generic.
    if (role && !entry.audience.includes(role) && !entry.audience.includes('owner')) {
      // owner can see everything; for other roles, strictly require inclusion.
      if (role !== 'owner') continue;
    }

    const titleScore = scoreTokens(tokens, entry.title, 4);
    const pageScore = scoreTokens(tokens, entry.page, 2);
    const breadcrumbScore = scoreTokens(tokens, entry.breadcrumb, 1.5);
    const keywordScore = scoreTokens(tokens, entry.keywords.join(' '), 1.2);
    const stepScore = entry.steps ? scoreTokens(tokens, entry.steps.join(' '), 0.8) : 0;

    const total = titleScore + pageScore + breadcrumbScore + keywordScore + stepScore;

    if (total > 0) {
      let matched: SearchResult['matched'] = 'keywords';
      if (titleScore >= Math.max(pageScore, breadcrumbScore, keywordScore, stepScore)) matched = 'title';
      else if (pageScore >= Math.max(breadcrumbScore, keywordScore, stepScore)) matched = 'page';
      else if (breadcrumbScore >= Math.max(keywordScore, stepScore)) matched = 'breadcrumb';
      else if (stepScore >= keywordScore) matched = 'steps';

      results.push({ entry, score: total, matched });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 12);
}

export function getHelpEntryById(id: string): HelpEntry | undefined {
  return STAFF_HELP_INDEX.find(e => e.id === id);
}
