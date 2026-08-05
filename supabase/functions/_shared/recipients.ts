// Shared staff email recipient resolver.
// Resolution: per-user override → role default (any held role enabled) → no email.

export const EMAIL_CATEGORIES = [
  'applications',
  'onboarding',
  'compliance',
  'dispatch',
  'messaging',
  'fleet_documents',
  'staff_admin',
] as const;

export type EmailCategory = typeof EMAIL_CATEGORIES[number];

export const STAFF_ROLES = ['owner', 'management', 'onboarding_staff', 'dispatcher'] as const;

export interface ResolvedRecipient {
  user_id: string;
  email: string;
}

/**
 * Resolve which staff users should receive emails for a category.
 * `admin` must be a service-role Supabase client.
 */
export async function resolveEmailRecipients(
  admin: any,
  category: EmailCategory,
): Promise<ResolvedRecipient[]> {
  const { data: roleRows } = await admin
    .from('user_roles')
    .select('user_id, role')
    .in('role', STAFF_ROLES as unknown as string[]);

  const rolesByUser = new Map<string, string[]>();
  (roleRows ?? []).forEach((r: any) => {
    const list = rolesByUser.get(r.user_id) ?? [];
    list.push(r.role);
    rolesByUser.set(r.user_id, list);
  });
  const userIds = Array.from(rolesByUser.keys());
  if (!userIds.length) return [];

  const { data: defaults } = await admin
    .from('notification_role_defaults')
    .select('role, email_enabled')
    .eq('category', category);

  const enabledRoles = new Set(
    (defaults ?? []).filter((d: any) => d.email_enabled).map((d: any) => d.role),
  );

  const { data: overrides } = await admin
    .from('staff_email_overrides')
    .select('user_id, email_enabled')
    .eq('category', category)
    .in('user_id', userIds);

  const overrideMap = new Map<string, boolean>();
  (overrides ?? []).forEach((o: any) => overrideMap.set(o.user_id, o.email_enabled));

  const eligible = userIds.filter((uid) => {
    if (overrideMap.has(uid)) return overrideMap.get(uid) === true;
    return (rolesByUser.get(uid) ?? []).some((r) => enabledRoles.has(r));
  });

  const out: ResolvedRecipient[] = [];
  for (const uid of eligible) {
    try {
      const { data } = await admin.auth.admin.getUserById(uid);
      if (data?.user?.email) out.push({ user_id: uid, email: data.user.email });
    } catch (_e) {
      // skip unresolvable users
    }
  }
  return out;
}

/** Convenience: just the email addresses. */
export async function resolveEmailAddresses(
  admin: any,
  category: EmailCategory,
): Promise<string[]> {
  return (await resolveEmailRecipients(admin, category)).map((r) => r.email);
}
