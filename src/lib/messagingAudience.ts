/**
 * Who staff may write to, and how that person is labelled.
 *
 * Every messaging surface (the Messages rail, New message, New group chat and
 * Bulk Message) derives its audience here so the four screens can never
 * disagree about whether a driver is active, still onboarding, gone, or a
 * denied applicant who should not be contacted at all.
 */

export type MessagingLifecycle = 'active' | 'onboarding' | 'inactive' | 'denied';

export type MessagingDispatchStatus = 'not_dispatched' | 'dispatched' | 'home' | 'truck_down';

export interface AudienceFacts {
  is_active?: boolean | null;
  is_demo?: boolean | null;
  on_hold?: boolean | null;
  is_departing?: boolean | null;
  deactivated_at?: string | null;
  go_live_date?: string | null;
  insurance_added_date?: string | null;
  /** applications.review_status for this person, when they have an application. */
  review_status?: string | null;
  /** True when a lease termination row exists for this operator. */
  terminated?: boolean;
}

/**
 * A denied application outranks everything: those people stay out of every
 * picker. Otherwise a terminated / deactivated record is inactive, a fully
 * live-and-insured active record is active, and everyone else is onboarding.
 */
export function deriveLifecycle(f: AudienceFacts): MessagingLifecycle {
  if (f.review_status === 'denied') return 'denied';
  if (f.terminated || f.deactivated_at || f.is_active === false) return 'inactive';
  if (f.is_active && f.go_live_date && f.insurance_added_date) return 'active';
  return 'onboarding';
}

export const LIFECYCLE_LABEL: Record<MessagingLifecycle, string> = {
  active: 'Active',
  onboarding: 'Onboarding',
  inactive: 'Inactive',
  denied: 'Denied',
};

export const DISPATCH_LABEL: Record<MessagingDispatchStatus, string> = {
  not_dispatched: 'Not Dispatched',
  dispatched: 'Dispatched',
  home: 'Home',
  truck_down: 'Truck Down',
};

export const DISPATCH_DOT: Record<MessagingDispatchStatus, string> = {
  not_dispatched: 'bg-muted-foreground',
  dispatched: 'bg-status-complete',
  home: 'bg-status-progress',
  truck_down: 'bg-destructive',
};

/** The line shown under a person's name in the contact list. */
export function audienceSubtitle(
  lifecycle: MessagingLifecycle,
  f: Pick<AudienceFacts, 'on_hold' | 'is_departing'>,
): string {
  if (lifecycle === 'active') {
    if (f.on_hold) return 'On hold';
    if (f.is_departing) return 'Departing';
    return 'Active';
  }
  return LIFECYCLE_LABEL[lifecycle];
}

/**
 * The single definition of "can this person receive in-app messages right
 * now". Returns null when reachable, otherwise a short human reason. Used by
 * the settings reachability card and the per-name badge so they can never
 * disagree.
 */
export function reachabilityBlock(
  lifecycle: MessagingLifecycle,
  accountStatus: string | null | undefined,
  hasLogin: boolean,
): string | null {
  if (!hasLogin) return 'No login account';
  if (lifecycle === 'denied') return 'Application denied';
  if (lifecycle === 'inactive') return LIFECYCLE_LABEL.inactive;
  if (accountStatus === 'denied' || accountStatus === 'inactive') return 'Account disabled';
  return null;
}

export type AudienceGroup = MessagingLifecycle | 'all';

/**
 * Denied people are never included unless explicitly asked for, no matter
 * which group is selected.
 */
export function matchesGroup(
  lifecycle: MessagingLifecycle,
  group: AudienceGroup,
  includeDenied: boolean,
): boolean {
  if (lifecycle === 'denied') return includeDenied && (group === 'all' || group === 'denied');
  if (group === 'all') return true;
  return lifecycle === group;
}
