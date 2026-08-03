import { supabase } from '@/integrations/supabase/client';

export type ProfileName = { first_name: string | null; last_name: string | null };

/**
 * Resolve display names for a set of auth user ids.
 *
 * PostgREST embeds only traverse real foreign keys, and no public table has an
 * FK into `profiles` except `eld_malfunction_events`. Columns like
 * `operators.user_id` and `equipment_receipts.uploaded_by` point at
 * `auth.users`, which PostgREST will not follow into `public.profiles`, so
 * `operators!inner(profiles(...))` fails the whole request and returns nothing.
 * Always do this second read keyed on the user id instead.
 */
export async function fetchProfileNames(userIds: (string | null | undefined)[]): Promise<Map<string, ProfileName>> {
  const ids = Array.from(new Set(userIds.filter((v): v is string => !!v)));
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, first_name, last_name')
    .in('user_id', ids);
  if (error) {
    console.error('[fetchProfileNames] failed', error);
    return new Map();
  }
  return new Map((data ?? []).map((p) => [p.user_id, { first_name: p.first_name, last_name: p.last_name }]));
}

export function formatProfileName(p: ProfileName | null | undefined, fallback = 'Driver'): string {
  return [p?.first_name, p?.last_name].filter(Boolean).join(' ') || fallback;
}

/**
 * Display name for an operator row.
 *
 * Sandbox/harness operators are often created under a staff member's own login
 * and have no application attached, so the raw fallback would surface that
 * staff member's name as if they were a driver. When the row is a demo account
 * with no application name, prefer its `demo_label` instead.
 */
export function operatorDisplayName(
  args: {
    application?: { first_name?: string | null; last_name?: string | null } | null;
    is_demo?: boolean | null;
    demo_label?: string | null;
    profile?: ProfileName | null;
  },
  fallback = 'Unknown',
): string {
  const appName = [args.application?.first_name, args.application?.last_name]
    .filter(Boolean).join(' ').trim();
  if (appName) return appName;
  if (args.is_demo && args.demo_label?.trim()) return args.demo_label.trim();
  const profileName = [args.profile?.first_name, args.profile?.last_name]
    .filter(Boolean).join(' ').trim();
  if (profileName && !args.is_demo) return profileName;
  return fallback;
}
