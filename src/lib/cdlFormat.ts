/**
 * Shared CDL display formatting.
 * Format: "D123456789 (MO) · Exp 03/14/2028" — each part omitted when absent.
 * Dates are noon-anchored so 'YYYY-MM-DD' never shifts a day in local time.
 */
export function formatCdl(
  number?: string | null,
  state?: string | null,
  expiration?: string | null,
): string | null {
  const num = number?.trim();
  if (!num) return null;
  let out = num;
  const st = state?.trim();
  if (st) out += ` (${st})`;
  const exp = expiration?.trim();
  if (exp) {
    const d = new Date(`${exp}T12:00:00`);
    if (!Number.isNaN(d.getTime())) {
      out += ` · Exp ${d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}`;
    }
  }
  return out;
}
