// Single source of truth for sender identities.
// Change here → change everywhere. No more per-file hardcoded "from:" lines.

export const SENDER_DOMAIN = 'notify.mysupertransport.com';
export const FROM_DOMAIN = 'mysupertransport.com';

// Human-readable display names + local parts per role.
const IDENTITIES = {
  onboarding: { name: 'SUPERTRANSPORT Onboarding', local: 'onboarding' },
  management: { name: 'SUPERTRANSPORT Management', local: 'onboarding' },
  operations: { name: 'SUPERTRANSPORT Operations', local: 'onboarding' },
  recruiting: { name: 'SUPERTRANSPORT Recruiting', local: 'recruiting' },
  noreply:    { name: 'SUPERTRANSPORT',            local: 'noreply' },
} as const;

export type SenderRole = keyof typeof IDENTITIES;

export function buildFrom(role: SenderRole = 'onboarding'): string {
  const { name, local } = IDENTITIES[role];
  return `${name} <${local}@${FROM_DOMAIN}>`;
}

export function replyTo(role: SenderRole = 'onboarding'): string {
  return `${IDENTITIES[role].local}@${FROM_DOMAIN}`;
}

/** Owner email (for auto-CC on deactivation etc.). Not resolved from role table
 *  by convention here — callers that need dynamic owners should query user_roles. */
export const OWNER_FALLBACK_EMAIL = 'marcus@mysupertransport.com';