import type { Database } from '@/integrations/supabase/types';

export type ClaimLevel = Database['public']['Enums']['claim_flag_level'];
export type ClaimType = Database['public']['Enums']['claim_type'];

export const CLAIM_TYPES: ClaimType[] = [
  'damaged_goods', 'late_delivery', 'shortage', 'service_failure',
  'rate_dispute', 'documentation_issue', 'other',
];

export const CLAIM_TYPE_LABELS: Record<ClaimType, string> = {
  damaged_goods: 'Damaged Goods',
  late_delivery: 'Late Delivery',
  shortage: 'Shortage',
  service_failure: 'Service Failure',
  rate_dispute: 'Rate Dispute',
  documentation_issue: 'Documentation Issue',
  other: 'Other',
};

export const CLAIM_LEVEL_LABELS: Record<ClaimLevel, string> = {
  watch: 'Watch',
  hold: 'Hold',
  cleared: 'Cleared',
};

/** Hold is deliberately the loudest: it blocks settlement. */
export const CLAIM_LEVEL_CLASSES: Record<ClaimLevel, string> = {
  watch: 'border-warning/45 bg-warning/15 text-warning',
  hold: 'border-destructive bg-destructive text-destructive-foreground',
  cleared: 'border-border bg-muted text-muted-foreground',
};

export const RESOLUTION_OUTCOMES = [
  { value: 'denied', label: 'Denied', help: 'The claim was rejected.' },
  { value: 'approved_in_full', label: 'Approved in full', help: 'The full claimed amount was accepted.' },
  { value: 'approved_in_part', label: 'Approved in part', help: 'A reduced amount was accepted.' },
  { value: 'withdrawn', label: 'Withdrawn', help: 'The claimant withdrew the claim.' },
] as const;

export type ResolutionOutcome = typeof RESOLUTION_OUTCOMES[number]['value'];

export function resolutionLabel(value: string | null | undefined): string {
  if (!value) return '—';
  return RESOLUTION_OUTCOMES.find(o => o.value === value)?.label ?? value;
}

export const AMOUNT_REQUIRED: ResolutionOutcome[] = ['approved_in_full', 'approved_in_part'];
