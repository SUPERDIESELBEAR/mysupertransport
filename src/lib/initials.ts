/**
 * Convert a person's display name into 1–2 uppercase initials.
 * Returns `'?'` when no usable letters are found, so callers can
 * always render the result inside an avatar fallback safely.
 *
 * Examples:
 *   initials('Marcus Mueller') === 'MM'
 *   initials('cher')           === 'C'
 *   initials('')               === '?'
 */
export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  return (
    name
      .trim()
      .split(/\s+/)
      .map(n => n[0])
      .filter(Boolean)
      .join('')
      .toUpperCase()
      .slice(0, 2) || '?'
  );
}

/**
 * Initials from separate first/last name fields. Useful for rows that
 * already store `first_name` and `last_name` columns and don't need to
 * concatenate them just to split them again.
 */
export function initialsFromParts(
  first: string | null | undefined,
  last: string | null | undefined,
): string {
  const a = (first ?? '').trim()[0] ?? '';
  const b = (last ?? '').trim()[0] ?? '';
  return ((a + b).toUpperCase()) || '?';
}