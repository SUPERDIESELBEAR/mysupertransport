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
