/**
 * Canonical carrier identity for APPLICATION-FACING surfaces.
 *
 * Deliberately NOT the same shape as the ELD/roadside carrier snapshot in
 * src/lib/eld/carrierIdentity.ts. A federal log must carry a real main-office
 * and terminal street address; the driver application must not — the company
 * shows only its locality on those documents.
 *
 * The record of truth is the `carrier_profile` singleton. These constants are
 * the fallback used when the profile cannot be read (offline, RLS, cold edge
 * invocation). They are never allowed to drift silently: the values below are
 * the same ones stored in carrier_profile today.
 */
export interface CompanyIdentity {
  legalName: string;
  locality: string;
  usdot: string;
  mc: string;
}

export const DEFAULT_COMPANY_IDENTITY: CompanyIdentity = {
  legalName: 'SUPERTRANSPORT, LLC',
  locality: 'Pleasant Hill, Missouri',
  usdot: '2309365',
  mc: '788425',
};

/** "USDOT 2309365 · MC 788425" */
export function identityRegistrationLine(i: CompanyIdentity): string {
  return `USDOT ${i.usdot} · MC ${i.mc}`;
}

/** One-line form used in footers and on the online form. */
export function identityLine(i: CompanyIdentity): string {
  return `${i.legalName} · ${i.locality} · ${identityRegistrationLine(i)}`;
}

/**
 * Builds a CompanyIdentity from a carrier_profile row, falling back field by
 * field. A profile missing its MC number must not blank the MC line on a
 * signed authorization.
 */
export function identityFromProfile(
  row: { legal_name?: string | null; usdot_number?: string | null; mc_number?: string | null } | null | undefined,
): CompanyIdentity {
  return {
    legalName: row?.legal_name?.trim() || DEFAULT_COMPANY_IDENTITY.legalName,
    locality: DEFAULT_COMPANY_IDENTITY.locality,
    usdot: row?.usdot_number?.trim() || DEFAULT_COMPANY_IDENTITY.usdot,
    mc: row?.mc_number?.trim() || DEFAULT_COMPANY_IDENTITY.mc,
  };
}
