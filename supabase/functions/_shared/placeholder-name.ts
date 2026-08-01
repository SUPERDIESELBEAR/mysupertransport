/**
 * Names that are not names. Compliance artifacts (the 395.34(a)(1) written
 * notice, the roadside packet, the return receipt, the lease termination)
 * carry the driver's legal name. A `|| 'Driver'` fallback puts a false name on
 * a federal document and passes every non-empty check, so these paths hard-fail
 * instead of rendering a placeholder.
 */
export const PLACEHOLDER_NAMES: readonly string[] = [
  'driver', 'unknown', 'operator', 'n/a', 'na', 'unnamed', 'test driver', 'test',
];

export function isPlaceholderName(name: string | null | undefined): boolean {
  return PLACEHOLDER_NAMES.includes((name ?? '').trim().toLowerCase());
}

/**
 * Returns the resolved name, or null when it cannot stand on a compliance
 * document. Callers must treat null as a hard failure, never as a default.
 */
export function resolvedDriverName(
  first: string | null | undefined,
  last: string | null | undefined,
): string | null {
  const name = [first, last].filter(Boolean).join(' ').trim();
  if (!name || isPlaceholderName(name)) return null;
  return name;
}