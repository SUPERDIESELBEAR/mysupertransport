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

/**
 * AMBIGUITY IS REFUSED (owner decision C, 2026-09-16).
 *
 * The database resolver `current_company_id()` returns NULL when a user matches
 * more than one distinct company. These helpers have no NULL to return — their
 * callers need a company_id — so their equivalent is a THROW that NAMES the user.
 * Picking one silently is the one outcome forbidden: it writes another carrier's
 * row under this carrier's name.
 *
 * There is no `.limit(1)` anywhere below, deliberately. `maybeSingle()` on two
 * membership rows does raise, but its message is
 * `Could not resolve company membership: multiple rows returned` — it does not
 * say WHOSE membership, and it reads like a transport failure rather than a
 * refusal, so it was replaced.
 */
async function distinctCompanies(
  admin: AnyClient,
  table: string,
  userId: string,
): Promise<string[]> {
  const { data, error } = await admin.from(table).select('company_id').eq('user_id', userId);
  if (error) throw new Error(`Could not resolve company from ${table}: ${error.message}`);
  const ids = (data ?? [])
    .map((r: { company_id: string | null }) => r.company_id)
    .filter((id: string | null): id is string => !!id);
  return [...new Set(ids)];
}

/** The company the staff caller belongs to. Throws when none, and when two. */
export async function companyIdForUser(admin: AnyClient, userId: string): Promise<string> {
  const companies = await distinctCompanies(admin, 'company_members', userId);
  if (companies.length > 1) {
    throw new Error(
      `User ${userId} is a member of more than one company (${companies.join(', ')}). Refusing to choose one.`,
    );
  }
  if (companies.length === 0) {
    throw new Error(
      `No company membership for user ${userId}. Add a company_members row before creating records for them.`,
    );
  }
  return companies[0];
}

/**
 * The company of ANY signed-in caller, from the same three sources as the
 * database resolver `current_company_id()`: membership (staff), his own operator
 * row (drivers), his own truck_owners row (truck owners, read directly).
 *
 * All three are read and combined — NOT tried in preference order, and never
 * short-circuited on the first hit — so two distinct companies are seen and
 * refused rather than resolved by whichever source happened to be read first.
 * Throws when none resolves; never falls back to a carrier.
 *
 * Use this in service-role functions a DRIVER or TRUCK OWNER can invoke;
 * `companyIdForUser` is membership-only and is for staff-caller functions.
 */
export async function companyIdForAnyUser(admin: AnyClient, userId: string): Promise<string> {
  const found = new Set<string>();
  for (const table of ['company_members', 'operators', 'truck_owners'] as const) {
    for (const id of await distinctCompanies(admin, table, userId)) found.add(id);
  }
  const companies = [...found];
  if (companies.length > 1) {
    throw new Error(
      `User ${userId} belongs to more than one company (${companies.join(', ')}) across company_members, operators and truck_owners. Refusing to choose one.`,
    );
  }
  if (companies.length === 0) {
    throw new Error(
      `No company for user ${userId}: no company_members, operators or truck_owners row. Refusing to guess a company.`,
    );
  }
  return companies[0];
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

/**
 * The company of an existing operator row. For service-role writes into
 * child tables of a driver (onboarding_status, dispatch rows, documents):
 * the parent operator is already carrier-scoped and is the authority.
 */
export async function companyIdForOperator(admin: AnyClient, operatorId: string): Promise<string> {
  const { data, error } = await admin
    .from('operators')
    .select('company_id')
    .eq('id', operatorId)
    .maybeSingle();
  if (error) throw new Error(`Could not read operator ${operatorId}: ${error.message}`);
  if (!data?.company_id) throw new Error(`No company for operator ${operatorId}`);
  return data.company_id as string;
}
