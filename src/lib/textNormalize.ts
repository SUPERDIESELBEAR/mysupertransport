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

function titleCaseWord(word: string, index: number): string {
  if (!word) return word;

  // Preserve short acronyms the user typed in caps ("US", "JFK", "LLC").
  if (word.length <= 3 && word === word.toUpperCase() && /[A-Z]/.test(word)) return word;

  const bare = word.replace(/[^A-Za-z]/g, '').toLowerCase();

  if (DIRECTIONALS.has(bare) && bare.length <= 3) {
    return word.replace(/[A-Za-z]+/, m => m.toUpperCase());
  }
  if (index > 0 && LOWER_WORDS.has(bare)) return word.toLowerCase();

  return word.replace(/[A-Za-z][A-Za-z']*/g, m => m.charAt(0).toUpperCase() + m.slice(1).toLowerCase());
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
