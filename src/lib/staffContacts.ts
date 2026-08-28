import { supabase } from '@/integrations/supabase/client';

export interface StaffContact {
  userId: string;
  name: string;
  avatarUrl: string | null;
  role: string | null;
}

/**
 * Names for staff (dispatchers, coordinators) as seen BY A DRIVER.
 *
 * A driver cannot read another person's `profiles` row — the SELECT policy is
 * self-or-staff — so a direct `profiles` read from the operator portal returns
 * nothing and the UI silently degrades to "Dispatcher assigned" with a dead
 * Message button. `get_staff_contact_info` is the SECURITY DEFINER path built
 * for exactly this: it is callable by operators and returns staff rows only.
 */
export async function fetchStaffContacts(
  userIds: (string | null | undefined)[],
): Promise<Map<string, StaffContact>> {
  const ids = Array.from(new Set(userIds.filter((v): v is string => !!v)));
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase.rpc('get_staff_contact_info', { _user_ids: ids });
  if (error) {
    console.error('[fetchStaffContacts] failed', error);
    return new Map();
  }
  return new Map(
    (data ?? []).map((row: any) => [
      row.user_id as string,
      {
        userId: row.user_id as string,
        name: [row.first_name, row.last_name].filter(Boolean).join(' ') || 'Dispatcher',
        avatarUrl: (row.avatar_url as string | null) ?? null,
        role: (row.primary_role as string | null) ?? null,
      },
    ]),
  );
}

/** Single-contact convenience wrapper. */
export async function fetchStaffContact(userId: string | null | undefined): Promise<StaffContact | null> {
  if (!userId) return null;
  return (await fetchStaffContacts([userId])).get(userId) ?? null;
}
