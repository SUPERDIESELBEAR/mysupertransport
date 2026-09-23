/**
 * Canonical carrier identity for APPLICATION-FACING surfaces.
 *
 * Deliberately NOT the same shape as the ELD/roadside carrier snapshot in
 * src/lib/eld/carrierIdentity.ts. A federal log must carry a real main-office
 * and terminal street address; the driver application must not — the company
 * shows only its locality on those documents.
 *
 * NO FALLBACK CONSTANTS. Until 2026-09-23 this module carried SUPERTRANSPORT's
 * legal name, locality, USDOT and MC as defaults, and anything that could not
 * read `carrier_profile` printed them — including the public /apply page, which
 * cannot read the table at all. With a second carrier that would have put
 * SUPERTRANSPORT's identity on another carrier's signed federal authorizations.
 *
 * The record of truth is `carrier_profile`, read per carrier. When it cannot be
 * read, the caller must SAY SO and print nothing.
 */
export interface CompanyIdentity {
  legalName: string;
  locality: string;
  usdot: string;
  mc: string;
}

/** The five public fields `carrier_public_identity()` returns. */
export interface PublicCarrierIdentityRow {
  legal_name?: string | null;
  applicant_locality?: string | null;
  usdot_number?: string | null;
  mc_number?: string | null;
  apply_slug?: string | null;
}

/** "USDOT 2309365 · MC 788425" */
export function identityRegistrationLine(i: CompanyIdentity): string {
  return `USDOT ${i.usdot} · MC ${i.mc}`;
}

/** One-line form used in footers and on the online form. */
export function identityLine(i: CompanyIdentity): string {
  return `${i.legalName} · ${i.locality} · ${identityRegistrationLine(i)}`;
}

/**
 * Builds a CompanyIdentity from a carrier row.
 *
 * Returns NULL when any of the four printed fields is missing. A signed
 * authorization with a blank company name, locality, USDOT or MC is not a
 * document — it is a defect, and the caller must refuse rather than emit it.
 */
export function identityFromProfile(
  row: PublicCarrierIdentityRow | null | undefined,
): CompanyIdentity | null {
  const legalName = row?.legal_name?.trim() || '';
  const locality = row?.applicant_locality?.trim() || '';
  const usdot = row?.usdot_number?.trim() || '';
  const mc = row?.mc_number?.trim() || '';
  if (!legalName || !locality || !usdot || !mc) return null;
  return { legalName, locality, usdot, mc };
}
