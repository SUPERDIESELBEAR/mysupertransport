// requireStaff — a single, correct staff auth check for every edge function.
//
// Kills the recurring class of bugs where each function reimplemented auth:
//   - `get_user_roles({ user_id })` vs `{ _user_id }` (broke send-osas-to-operator)
//   - reading `app_metadata.roles` that was never populated
//   - inconsistent 401/403 responses without CORS
//
// Usage:
//   const auth = await requireStaff(req);
//   if (auth instanceof Response) return auth;
//   const { userId, email } = auth;
//
// Optional role gate:
//   const auth = await requireStaff(req, { roles: ['owner', 'management'] });

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { fail } from './respond.ts';

export type StaffRole =
  | 'owner'
  | 'management'
  | 'onboarding_staff'
  | 'dispatcher';

export const DEFAULT_STAFF_ROLES: StaffRole[] = [
  'owner',
  'management',
  'onboarding_staff',
  'dispatcher',
];

export interface StaffAuth {
  userId: string;
  email: string;
  roles: StaffRole[];
  /** Service-role client, ready for RLS-bypassing DB work. */
  supabase: SupabaseClient;
  /** Auth header string passed by the caller, for onward invoke() calls. */
  authHeader: string;
}

export interface RequireStaffOptions {
  /** If provided, caller must have at least one of these roles. */
  roles?: StaffRole[];
}

function getServiceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function requireStaff(
  req: Request,
  options: RequireStaffOptions = {},
): Promise<StaffAuth | Response> {
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return fail(401, 'Unauthorized: missing bearer token');
  }
  const token = authHeader.slice('Bearer '.length);

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
  if (claimsError || !claimsData?.claims) {
    return fail(401, 'Unauthorized: invalid or expired token', {
      cause: claimsError?.message,
    });
  }
  const userId = claimsData.claims.sub as string;
  const email = (claimsData.claims.email as string | undefined) ?? '';

  const supabase = getServiceClient();
  const allowed = options.roles && options.roles.length > 0
    ? options.roles
    : DEFAULT_STAFF_ROLES;

  // Always query user_roles directly with the service client — the JWT rarely
  // has roles in app_metadata, so relying on claims silently locks users out.
  const { data: roleRows, error: roleError } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .in('role', allowed);

  if (roleError) {
    console.error('requireStaff: user_roles lookup failed', roleError);
    return fail(500, 'Failed to verify caller role', { cause: roleError.message });
  }

  const roles = (roleRows ?? []).map(r => r.role as StaffRole);
  if (roles.length === 0) {
    return fail(403, 'Forbidden: caller lacks required staff role', {
      requiredAny: allowed,
    });
  }

  return { userId, email, roles, supabase, authHeader };
}

/**
 * Weaker variant: verifies a valid JWT but does not enforce a staff role.
 * Use for operator-facing endpoints where the caller is a driver.
 */
export async function requireAuthedUser(
  req: Request,
): Promise<{ userId: string; email: string; supabase: SupabaseClient; authHeader: string } | Response> {
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return fail(401, 'Unauthorized: missing bearer token');
  }
  const token = authHeader.slice('Bearer '.length);
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data, error } = await userClient.auth.getClaims(token);
  if (error || !data?.claims) {
    return fail(401, 'Unauthorized: invalid or expired token');
  }
  return {
    userId: data.claims.sub as string,
    email: (data.claims.email as string | undefined) ?? '',
    supabase: getServiceClient(),
    authHeader,
  };
}