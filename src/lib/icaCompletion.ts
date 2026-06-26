/**
 * Single source of truth for "the driver's ICA is signed/complete".
 *
 * Two flows can complete an ICA from the driver portal:
 *   1) Owner-operator self-sign (OperatorICASign) — sets
 *      `onboarding_status.ica_status = 'complete'` and flips the contract to
 *      `fully_executed`.
 *   2) Non-owner driver acknowledging an owner-signed ICA
 *      (DriverICAAcknowledgment) — inserts into `ica_driver_acknowledgments`
 *      and (now) also flips `onboarding_status.ica_status = 'complete'`.
 *
 * Every CTA, banner, badge and tab indicator in the driver portal that used
 * to compare `ica_status === 'sent_for_signature'` should funnel through this
 * helper so the "signed" state shows up everywhere consistently.
 */
export function isIcaComplete(
  os?: { ica_status?: string | null } | null,
  contract?: { status?: string | null; contractor_signed_at?: string | null } | null,
): boolean {
  const onboardingStatus = String(os?.ica_status ?? '').trim().toLowerCase();
  const contractStatus = String(contract?.status ?? '').trim().toLowerCase();

  if (['complete', 'completed', 'signed', 'fully_executed'].includes(onboardingStatus)) return true;
  if (['fully_executed', 'completed', 'complete', 'signed'].includes(contractStatus)) return true;
  if (contract?.contractor_signed_at) return true;
  return false;
}

/** True when the driver still needs to sign/acknowledge. */
export function isIcaActionRequired(
  os?: { ica_status?: string | null } | null,
  contract?: { status?: string | null; contractor_signed_at?: string | null } | null,
): boolean {
  if (isIcaComplete(os, contract)) return false;
  return String(os?.ica_status ?? '').trim().toLowerCase() === 'sent_for_signature';
}