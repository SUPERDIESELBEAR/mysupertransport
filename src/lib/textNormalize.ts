/**
 * Shared text normalization helpers for form input across the app.
 * All helpers are pure and safe to call on empty / undefined values.
 */

/** Trims the ends and collapses internal whitespace runs to a single space. */
export function normalizeWhitespace(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/\s+/g, ' ').trim();
}

const LOWER_WORDS = new Set(['of', 'and', 'the', 'in', 'at', 'on', 'for', 'to', 'by']);
const DIRECTIONALS = new Set(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw', 'nne', 'nnw', 'sse', 'ssw']);

/**
 * Street type abbreviations are not acronyms — they must always title case
 * ("ST" -> "St"), even though the acronym rule would otherwise preserve them.
 */
const STREET_TYPES = new Set([
  'st', 'rd', 'ave', 'av', 'blvd', 'dr', 'ln', 'ct', 'cir', 'pl', 'pkwy', 'pky',
  'hwy', 'ter', 'trl', 'way', 'pike', 'expy', 'fwy', 'sq', 'plz', 'aly', 'bnd',
  'crk', 'xing', 'loop', 'run', 'path', 'rte', 'tpke', 'mtwy',
]);

/**
 * Genuine compound names that begin with Mac, De, La, or Van. These are split
 * after the prefix so the following letter is capitalized. Any word not on
 * this list is treated as an ordinary word and left flat — a missed cosmetic
 * correction is safer than a wrongly split place name like "MacOn".
 */
const INNER_CAPITAL_PREFIXES = new Set([
  'macarthur', 'macdonald', 'mackenzie', 'macmillan',
  'desoto', 'dekalb', 'dewitt',
  'lasalle', 'lagrange', 'laporte', 'lacrosse',
  'vanburen', 'vanderbilt', 'vanhorn', 'vannuys',
]);

const titleCasePlain = (word: string) =>
  word.replace(/[A-Za-z][A-Za-z']*/g, m => m.charAt(0).toUpperCase() + m.slice(1).toLowerCase());

/**
 * Rebuild a word so an inner capital is preserved after a prefix:
 *   McCree, O'Brien, MacArthur, DeSoto, LaSalle, VanBuren.
 * Returns null when the word does not match a known pattern.
 */
function applyInnerCapital(word: string): string | null {
  // Mc / MC / mc followed by a letter: McCree, MCCREE -> McCree.
  const mc = word.match(/^([Mm][Cc])([A-Za-z])([A-Za-z]*)([^A-Za-z]*)$/);
  if (mc) {
    return `Mc${mc[2].toUpperCase()}${mc[3].toLowerCase()}${mc[4]}`;
  }
  // O' followed by a letter: O'Brien, O'BRIEN -> O'Brien.
  const o = word.match(/^([Oo]')([A-Za-z])([A-Za-z]*)([^A-Za-z]*)$/);
  if (o) {
    return `O'${o[2].toUpperCase()}${o[3].toLowerCase()}${o[4]}`;
  }
  // Mac/De/La/Van only when the full word is a known compound name.
  const bare = word.replace(/[^A-Za-z]/g, '').toLowerCase();
  if (INNER_CAPITAL_PREFIXES.has(bare)) {
    const prefixLen = bare.startsWith('mac') ? 3 : 2;
    const prefix = bare.slice(0, prefixLen);
    const next = bare[prefixLen];
    const rest = bare.slice(prefixLen + 1);
    const leading = word.match(/^[^A-Za-z]*/)?.[0] ?? '';
    const trailing = word.match(/[^A-Za-z]*$/)?.[0] ?? '';
    const titlePrefix = prefix.charAt(0).toUpperCase() + prefix.slice(1).toLowerCase();
    return `${leading}${titlePrefix}${next.toUpperCase()}${rest.toLowerCase()}${trailing}`;
  }
  return null;
}

function titleCaseWord(word: string, index: number): string {
  if (!word) return word;

  const bareEarly = word.replace(/[^A-Za-z]/g, '').toLowerCase();

  // Directionals win over street types ("N", "SE" stay uppercase).
  if (DIRECTIONALS.has(bareEarly) && bareEarly.length <= 3) {
    return word.replace(/[A-Za-z]+/, m => m.toUpperCase());
  }
  // Street types always title case, and the trailing period is dropped
  // ("ST." -> "St") so addresses stay consistent regardless of source formatting.
  if (STREET_TYPES.has(bareEarly)) {
    return titleCasePlain(word.replace(/\.$/, ''));
  }

  // Preserve genuine inner capitals in names (McCree, O'Brien, MacArthur, DeSoto).
  const inner = applyInnerCapital(word);
  if (inner !== null) return inner;

  // Preserve short acronyms the user typed in caps ("US", "JFK", "LLC").
  if (word.length <= 3 && word === word.toUpperCase() && /[A-Z]/.test(word)) return word;

  if (index > 0 && LOWER_WORDS.has(bareEarly)) return word.toLowerCase();

  return titleCasePlain(word);
}

/**
 * "kansas city" -> "Kansas City", "winston-salem" -> "Winston-Salem",
 * "1400 industrial dr ne" -> "1400 Industrial Dr NE". Already-uppercase
 * acronyms of three characters or fewer are preserved.
 */
export function toTitleCase(value: string | null | undefined): string {
  const cleaned = normalizeWhitespace(value);
  if (!cleaned) return '';

  return cleaned
    .split(' ')
    .map((word, index) =>
      word
        .split('-')
        .map((part, partIndex) => titleCaseWord(part, index + partIndex))
        .join('-'),
    )
    .join(' ');
}

/** 5-digit ZIP, or ZIP+4 formatted as "12345-6789" when more digits are given. */
export function normalizeZip(value: string | null | undefined): string {
  const digits = (value ?? '').replace(/\D/g, '');
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5, 9)}`;
}

/** Digits only, for storage. Drops a leading US country code. */
export function normalizePhone(value: string | null | undefined): string {
  let digits = (value ?? '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  return digits.slice(0, 10);
}

/** Display formatting: "(555) 123-4567". Partial input formats progressively. */
export function formatPhone(value: string | null | undefined): string {
  const d = normalizePhone(value);
  if (d.length === 0) return '';
  if (d.length <= 3) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/**
 * A name arriving from a broker's system ("GADSDEN_WAREHOUSING_INC") is a data
 * formatting artifact, not a stylistic choice: underscores become spaces and the
 * result is title cased. Short all-caps acronyms are still preserved by toTitleCase.
 */
export function normalizeImportedName(value: string | null | undefined): string {
  const spaced = (value ?? '').replace(/_+/g, ' ');
  return toTitleCase(spaced);
}
