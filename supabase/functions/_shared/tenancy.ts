/**
 * Server-side company resolution for service-role writes.
 *
 * Tenancy is stamped in the database by `aa_stamp_tenant_company_id`, which
 * assigns `current_company_id()` whenever the caller's membership resolves and
 * overwrites anything that arrived with the row. A browser can therefore never
 * choose its company.
 *
 * Service-role callers are the one exception: they carry no `auth.uid()`, so
 * membership cannot resolve and the trigger refuses unless the row names its
 * company explicitly. These helpers are how such a function names it — from a
 * membership row, or, for the bootstrap tools that have no caller at all, from
 * the single carrier row with a hard refusal once a second company exists.
 *
 * Neither helper ever falls back to "the first carrier".
 */

type AnyClient = {
  from: (t: string) => any;
};

/** The company the staff caller belongs to. Throws when they belong to none. */
export async function companyIdForUser(admin: AnyClient, userId: string): Promise<string> {
  const { data, error } = await admin
    .from('company_members')
    .select('company_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(`Could not resolve company membership: ${error.message}`);
  if (!data?.company_id) {
    throw new Error(
      `No company membership for user ${userId}. Add a company_members row before creating records for them.`,
    );
  }
  return data.company_id as string;
}

/**
 * The company of ANY signed-in caller, in the same order as the database
 * resolver `current_company_id()`: membership (staff), then his own operator
 * row (drivers), then his own truck_owners row (truck owners, read directly).
 * Throws when none of the three resolves — never falls back to a carrier.
 *
 * Use this in service-role functions a DRIVER or TRUCK OWNER can invoke;
 * `companyIdForUser` is membership-only and is for staff-caller functions.
 */
export async function companyIdForAnyUser(admin: AnyClient, userId: string): Promise<string> {
  for (const table of ['company_members', 'operators', 'truck_owners'] as const) {
    const { data, error } = await admin
      .from(table)
      .select('company_id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Could not resolve company from ${table}: ${error.message}`);
    if (data?.company_id) return data.company_id as string;
  }
  throw new Error(
    `No company for user ${userId}: no company_members, operators or truck_owners row. Refusing to guess a company.`,
  );
}

/**
 * The only company in the database. For bootstrap/test tools invoked with a
 * shared secret and no signed-in caller. Refuses once a second company exists,
 * because at that point the tool must be told which one it means.
 */
export async function soleCompanyId(admin: AnyClient): Promise<string> {
  const { data, error } = await admin.from('carrier_profile').select('id');
  if (error) throw new Error(`Could not read carrier_profile: ${error.message}`);
  const rows = data ?? [];
  if (rows.length !== 1) {
    throw new Error(
      `Expected exactly one carrier_profile row, found ${rows.length}. This tool must be given an explicit company_id before it can run in a multi-company database.`,
    );
  }
  return rows[0].id as string;
}
