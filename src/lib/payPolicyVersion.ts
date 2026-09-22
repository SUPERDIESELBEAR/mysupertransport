/**
 * THE PAY-POLICY VERSION IN FORCE ON A DATE — one resolver, project-wide.
 *
 * PER-DRIVER PAY, PASS 1 (design 2026-09-22, option (c)).
 *
 * Why this module exists. Until this pass, six readers took the company-default
 * pay policy with `.maybeSingle()` or a bare `LIMIT 1` and **no date test at
 * all**. That was correct only for as long as exactly one policy row could ever
 * exist. The moment a second version exists:
 *
 *   - `.maybeSingle()` ERRORS on two rows — the settlement run stops;
 *   - a bare `LIMIT 1` picks an ARBITRARY version;
 *   - `ORDER BY effective_date DESC LIMIT 1` picks the NEWEST version, including
 *     one dated in the FUTURE, which would leak a rate that has not started yet
 *     into today's screens and into a past week's settlement.
 *
 * So the date test lands BEFORE any second version can be created (Pass 1
 * before Pass 2), and it lands in ONE place, because the failure mode of getting
 * one reader wrong is a wrong percentage that looks right.
 *
 * WHICH DATE each caller resolves against is the caller's business and is never
 * defaulted here:
 *   - a driver settlement run     → the WORK WEEK's start
 *   - a dispatch settlement run   → the MONTH's start
 *   - a screen, a hint, a forecast → TODAY
 *
 * The database has its own single resolver, `public.company_pay_policy_on(date)`,
 * used by the three SECURITY DEFINER functions. The two must agree, and the
 * window is stated identically in both: open-start when `effective_from` is
 * NULL, current when `effective_to` is NULL.
 */

/**
 * The PostgREST client, typed as the settlement runs already type it
 * (`type Client = any` in settlementRun.ts). The generated table types do not
 * describe a partially-built query, and inventing a structural stand-in here
 * would be a second, weaker description of the same thing.
 */
type PolicyClient = any;

/** The awaited shape every call site already handles. */
export interface PolicyReadResult<T> { data: T | null; error: unknown }

/** A "YYYY-MM-DD" carrier-zone date. Callers pass the date they are asking about. */
export type AsOfDate = string;

/** Today, in the carrier's own terms. The only place a screen's date is derived. */
export function todayAsOf(): AsOfDate {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The dated single-row read of the company-default policy version.
 *
 * Returns the PostgREST builder, NOT the row, so every existing call site keeps
 * its own error handling (`rowOf(...)`, `logDbError(...)`, a toast) exactly as it
 * was. `.limit(1)` before `.maybeSingle()` is what makes the single read exact
 * instead of hopeful: two overlapping versions can never make a reader throw.
 *
 * `is_active` is part of the window on purpose. An archived policy is not a rate
 * anyone should be paid on, and the one live row is active, so nothing moves
 * today — but a reader that ignored it would quietly resurrect a retired
 * version.
 */
export function companyPolicyVersionQuery<T = Record<string, unknown>>(
  sb: PolicyClient,
  asOf: AsOfDate,
): PromiseLike<PolicyReadResult<T>> {
  return sb
    .from('pay_policies')
    // Deliberately the whole row, with a LITERAL select argument: a column list
    // passed in by the caller cannot be checked by the PostgREST embed guard, and
    // a pay policy is one narrow row — there is nothing to save by trimming it.
    .select('*')
    .eq('is_company_default', true)
    .eq('is_active', true)
    // Open-start versions cover every earlier date; a NULL effective_to is the
    // CURRENT version. Both halves must be stated, or a closed version answers
    // for a date it no longer governs.
    .or(`effective_from.is.null,effective_from.lte.${asOf}`)
    .or(`effective_to.is.null,effective_to.gte.${asOf}`)
    // Newest start wins when windows overlap, matching the database resolver.
    .order('effective_from', { ascending: false, nullsFirst: false })
    .order('effective_date', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle() as PromiseLike<PolicyReadResult<T>>;
}

/**
 * Convenience read for callers that want the row and have no error handling of
 * their own to preserve. Returns null rather than throwing: a missing policy
 * costs a hint, never a screen.
 */
export async function fetchCompanyPolicyVersion<T = Record<string, unknown>>(
  sb: PolicyClient,
  asOf: AsOfDate,
): Promise<T | null> {
  const res = await companyPolicyVersionQuery<T>(sb, asOf);
  return res?.data ?? null;
}

/** All company versions for staff history screens; still centralized here so no screen invents a second reader. */
export function companyPolicyHistoryQuery<T = Record<string, unknown>>(
  sb: PolicyClient,
): PromiseLike<{ data: T[] | null; error: unknown }> {
  return sb
    .from('pay_policies')
    .select('*')
    .eq('is_company_default', true)
    .order('effective_from', { ascending: false, nullsFirst: false })
    .order('effective_date', { ascending: false }) as PromiseLike<{ data: T[] | null; error: unknown }>;
}
