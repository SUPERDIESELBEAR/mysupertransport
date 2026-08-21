/**
 * Duplicate broker detection used before creating a new broker record.
 *
 * Matching is intentionally conservative: an MC number is authoritative,
 * and name matching strips only legal entity suffixes, never industry
 * words like "Logistics" or "Trucking", so unrelated companies are not
 * false-matched.
 */

export interface BrokerMatchInput {
  company_name: string;
  mc_number: string | null;
}

export interface BrokerDuplicate {
  id: string;
  company_name: string;
  mc_number: string | null;
  city: string | null;
  state: string | null;
  primary_contact_name: string | null;
  /** Set by findDuplicateBrokers when the row is returned as a match. */
  matchReason?: 'mc' | 'name';
}

/** Digits only, so "MC 123456", "123456", and "mc-123456" collapse. */
export function normalizeMC(value: string | null | undefined): string {
  return (value ?? '').replace(/[^0-9]/g, '').trim();
}

/**
 * Strip only genuine legal entity suffixes and punctuation. Industry words
 * (Logistics, Transport, Freight, Trucking, Carriers, Express) are left in
 * place so "Smith Logistics" and "Smith Trucking" stay distinct.
 */
export function normalizeBrokerName(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/\b(inc\.?|inc|llc\.?|l\.l\.c\.?|l\.l\.c|ltd\.?|ltd|corp\.?|corp|co\.?|lp\.?|lp|llp\.?|llp)\b/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function nameMatches(a: string, b: string): boolean {
  const na = normalizeBrokerName(a);
  const nb = normalizeBrokerName(b);
  if (!na || !nb) return false;
  return na === nb;
}

/**
 * Find existing brokers that look like the new candidate. Returns an empty
 * array when no plausible duplicate exists. Never auto-selects.
 */
export function findDuplicateBrokers(
  candidate: BrokerMatchInput,
  existing: BrokerDuplicate[],
): BrokerDuplicate[] {
  const candidateMC = normalizeMC(candidate.mc_number);

  const matches = new Map<string, BrokerDuplicate>();

  for (const row of existing) {
    const rowMC = normalizeMC(row.mc_number);

    if (candidateMC && rowMC && candidateMC === rowMC) {
      matches.set(row.id, { ...row, matchReason: 'mc' });
      continue;
    }

    // Name match whenever the new record has no MC number, regardless of
    // whether the existing record has one. If the candidate does have an MC
    // and it didn't match, a name-only match is too weak to warn on.
    if (!candidateMC && nameMatches(candidate.company_name, row.company_name)) {
      matches.set(row.id, { ...row, matchReason: 'name' });
    }
  }

  return Array.from(matches.values()).sort((a, b) => {
    if (a.matchReason === 'mc' && b.matchReason !== 'mc') return -1;
    if (a.matchReason !== 'mc' && b.matchReason === 'mc') return 1;
    return a.company_name.localeCompare(b.company_name);
  });
}
