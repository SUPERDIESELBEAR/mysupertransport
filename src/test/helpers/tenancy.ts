/**
 * TENANCY IN THE PSQL HARNESS.
 *
 * `public.current_company_id()` no longer returns the first `carrier_profile`
 * row. Since the 2026-09-13 resolver rewrite it is
 * `SELECT company_id FROM company_members WHERE user_id = auth.uid()`, definer,
 * with NO fallback — an unresolvable caller resolves to NULL and every
 * `company_id NOT NULL` billing column refuses the insert.
 *
 * A raw `psql` session has no JWT, so `auth.uid()` is NULL and the stamp
 * trigger writes NULL. That is CORRECT behaviour, not a harness bug: the
 * boundary is fail-closed. Tests that exercise billing inserts must therefore
 * say WHO they are inserting as.
 *
 * `AS_COMPANY_MEMBER` adopts an existing member — resolved live, not hardcoded,
 * so it does not rot when staff change — for the current transaction only
 * (`set_config(..., true)` is transaction-local, so the ROLLBACK every one of
 * these tests already performs also drops the identity).
 *
 * If `company_members` is ever empty, `sub` is null, the resolver returns NULL
 * and the insert fails loudly. That is the intended signal, not a silent pass.
 */
/**
 * DEMO CARRIER, STAGE 2: the member is SUPERTRANSPORT's, named by USDOT 2309365
 * (globally unique), not "the oldest membership row". Unfiltered, this helper
 * would adopt whichever carrier's staff happened to be created first the day a
 * second carrier exists — and the billing tests would stay green while writing
 * their scratch rows under the wrong company.
 */
export const AS_COMPANY_MEMBER = `SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT cm.user_id FROM public.company_members cm
                              JOIN public.carrier_profile c ON c.id = cm.company_id
                             WHERE c.usdot_number = '2309365'
                             ORDER BY cm.created_at LIMIT 1),
                    'role', 'authenticated')::text, true);`;

/** Prepends the membership identity to every transaction the SQL opens. */
export function withCompanyMember(sql: string): string {
  return sql.replace(/\bBEGIN\s*;/g, `BEGIN; ${AS_COMPANY_MEMBER}`);
}
