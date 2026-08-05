export const EMAIL_CATEGORIES = [
  {
    key: 'applications',
    label: 'Applications',
    description: 'New application received, moved to pending, revisions requested/reverted, denials, correction requests, document retake requests.',
  },
  {
    key: 'onboarding',
    label: 'Onboarding',
    description: 'Onboarding milestones, documents uploaded, idle operator alerts, pay setup submitted, payroll docs.',
  },
  {
    key: 'compliance',
    label: 'Compliance',
    description: 'CDL / Med cert expiry reminders, inspection expiry, ELD escalations.',
  },
  {
    key: 'dispatch',
    label: 'Dispatch',
    description: 'Truck down alerts and dispatch status changes.',
  },
  {
    key: 'messaging',
    label: 'Messaging',
    description: '48-hour unread message reminders.',
  },
  {
    key: 'fleet_documents',
    label: 'Fleet & Documents',
    description: 'Binder shares, officer packets, onboarding-to-Vehicle-Hub sync notices.',
  },
  {
    key: 'staff_admin',
    label: 'Staff & Admin',
    description: 'Staff invites, release notes, deactivation notices, birthdays and anniversaries.',
  },
] as const;

export type EmailCategoryKey = typeof EMAIL_CATEGORIES[number]['key'];

export const EMAIL_ROLES = [
  { key: 'owner', label: 'Owner' },
  { key: 'management', label: 'Management' },
  { key: 'onboarding_staff', label: 'Onboarding' },
  { key: 'dispatcher', label: 'Dispatch' },
  { key: 'truck_owner', label: 'Truck Owner' },
] as const;

export type EmailRoleKey = typeof EMAIL_ROLES[number]['key'];
