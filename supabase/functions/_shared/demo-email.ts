// Shared demo-account email safety helper.
//
// Demo driver accounts must never receive real outbound mail. Any send aimed at a
// demo driver is rerouted to the acting staff member's own inbox with a [DEMO]
// subject prefix. If no acting staff member can be resolved (e.g. a cron-driven
// send), the email is skipped entirely.

export interface DemoRedirect {
  /** True when the original recipient belongs to a demo account. */
  isDemo: boolean;
  /** Address the email should actually go to (staff inbox). Null => skip send. */
  redirectTo: string | null;
  /** Human label of the demo driver, for the subject/banner. */
  demoLabel: string | null;
}

const NOT_DEMO: DemoRedirect = { isDemo: false, redirectTo: null, demoLabel: null };

/** Is this email address attached to a demo driver account? */
export async function isDemoRecipient(admin: any, email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  const { data } = await admin
    .from('applications')
    .select('id')
    .ilike('email', email.trim())
    .eq('is_demo', true)
    .limit(1);
  return !!(data && data.length > 0);
}

/** Resolve the email address of the staff member who triggered this request. */
export async function resolveCallerEmail(admin: any, authHeader: string | null): Promise<string | null> {
  if (!authHeader) return null;
  try {
    const token = authHeader.replace('Bearer ', '');
    const { data } = await admin.auth.getUser(token);
    return data?.user?.email ?? null;
  } catch {
    return null;
  }
}

/**
 * Decide how to handle an outbound email for a possibly-demo recipient.
 * Returns `isDemo: false` for normal recipients (send as usual).
 */
export async function resolveDemoRedirect(
  admin: any,
  recipientEmail: string | null | undefined,
  authHeader: string | null,
  demoLabel?: string | null,
): Promise<DemoRedirect> {
  if (!(await isDemoRecipient(admin, recipientEmail))) return NOT_DEMO;
  const callerEmail = await resolveCallerEmail(admin, authHeader);
  return {
    isDemo: true,
    redirectTo: callerEmail,
    demoLabel: demoLabel ?? recipientEmail ?? null,
  };
}

/** Prefix a subject line for a demo send. */
export function demoSubject(subject: string, demoLabel: string | null): string {
  const who = demoLabel ? ` → ${demoLabel}` : '';
  return `[DEMO${who}] ${subject}`;
}

/** Plain banner line injected at the top of a demo email body. */
export function demoBanner(originalRecipient: string | null): string {
  return `DEMO EMAIL — this message was generated for the demo account ${originalRecipient ?? 'unknown'} and rerouted to you. No driver received it.`;
}
