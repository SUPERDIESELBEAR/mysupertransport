/**
 * Single source of truth for "the driver's ICA is signed/complete".
 *
 * There is exactly ONE signer per ICA:
 *   - Owner-operator (no separate truck owner): the driver signs it themself.
 *   - Unit with a linked truck owner: the TRUCK OWNER signs it. The driver
 *     gets no ICA notice and no acknowledgment step — the executed agreement
 *     is auto-filed into their DOT inspection binder as "Lease Agreement (ICA)".
 * Either way the contract flips to `fully_executed` and
 * `onboarding_status.ica_status` becomes `complete`.
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