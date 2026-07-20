/**
 * Central taxonomy for in-app notifications.
 *
 * Every notification `type` string produced anywhere in the app maps to:
 *   - a `tier` (Action Needed / Watch / FYI) — drives sort + color in triage UI
 *   - a `category` — drives filter chips and grouping headers
 *   - a human `label`
 *
 * Unknown types fall through to `DEFAULT_META` so the UI never crashes on
 * new event types added by future edge functions.
 */

export type NotifTier = 'action' | 'watch' | 'fyi';
export type NotifCategory =
  | 'applications'
  | 'onboarding'
  | 'compliance'
  | 'dispatch'
  | 'equipment'
  | 'messages'
  | 'system'
  | 'team';

export interface NotifMeta {
  tier: NotifTier;
  category: NotifCategory;
  label: string;
}

export const DEFAULT_META: NotifMeta = {
  tier: 'fyi',
  category: 'system',
  label: 'Notification',
};

export const NOTIF_TAXONOMY: Record<string, NotifMeta> = {
  // Applications
  new_application:            { tier: 'action', category: 'applications', label: 'New Application' },
  application_approved:       { tier: 'watch',  category: 'applications', label: 'Application Approved' },
  application_denied:         { tier: 'action', category: 'applications', label: 'Application Denied' },
  pei_correction_requested:   { tier: 'action', category: 'applications', label: 'PEI Correction Requested' },

  // Onboarding
  onboarding_milestone:       { tier: 'watch',  category: 'onboarding',   label: 'Onboarding Milestone' },
  docs_uploaded:              { tier: 'action', category: 'onboarding',   label: 'Docs Uploaded' },
  document_uploaded:          { tier: 'action', category: 'onboarding',   label: 'Document Uploaded' },
  pay_setup_submitted:        { tier: 'action', category: 'onboarding',   label: 'Pay Setup Submitted' },
  qpassport_uploaded:         { tier: 'watch',  category: 'onboarding',   label: 'QPassport Uploaded' },

  // Compliance
  compliance_update:          { tier: 'watch',  category: 'compliance',   label: 'Compliance Update' },
  cert_expiring:              { tier: 'action', category: 'compliance',   label: 'Certificate Expiring' },

  // Dispatch
  truck_down:                 { tier: 'action', category: 'dispatch',     label: 'Truck Down' },
  dispatch_status_change:     { tier: 'watch',  category: 'dispatch',     label: 'Dispatch Status' },

  // Messages
  new_message:                { tier: 'action', category: 'messages',     label: 'New Message' },

  // System
  release_note:               { tier: 'watch',  category: 'system',       label: "What's New" },

  // Team / assignments
  assignment:                 { tier: 'action', category: 'team',         label: 'Assigned to You' },
  assignment_ack:             { tier: 'fyi',    category: 'team',         label: 'Assignment Update' },
  assignment_audit:           { tier: 'fyi',    category: 'team',         label: 'Assignment Audit' },
};

export const CATEGORY_LABELS: Record<NotifCategory, string> = {
  applications: 'Applications',
  onboarding:   'Onboarding',
  compliance:   'Compliance',
  dispatch:     'Dispatch',
  equipment:    'Equipment',
  messages:     'Messages',
  system:       'System',
  team:         'Team',
};

export const TIER_LABELS: Record<NotifTier, string> = {
  action: 'Action Needed',
  watch:  'Watch',
  fyi:    'FYI',
};

export const TIER_ORDER: NotifTier[] = ['action', 'watch', 'fyi'];

export function metaForType(type: string | null | undefined): NotifMeta {
  if (!type) return DEFAULT_META;
  return NOTIF_TAXONOMY[type] ?? DEFAULT_META;
}

export function resolveTier(row: { priority?: string | null; type?: string | null }): NotifTier {
  const p = (row.priority ?? '').toLowerCase();
  if (p === 'action' || p === 'watch' || p === 'fyi') return p;
  return metaForType(row.type ?? null).tier;
}

export function resolveCategory(row: { type?: string | null }): NotifCategory {
  return metaForType(row.type ?? null).category;
}
