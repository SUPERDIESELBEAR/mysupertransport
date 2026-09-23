/**
 * Browser-side carrier identity for application surfaces.
 *
 * Canonical definitions: supabase/functions/_shared/application/identity.ts.
 * The re-export keeps one definition, so the letterhead the applicant signs and
 * the letterhead the PDF renderer draws can never disagree.
 *
 * THE PUBLIC PAGE CANNOT READ carrier_profile. It is anonymous, and the table is
 * staff-only. Before 2026-09-23 it therefore printed hard-coded SUPERTRANSPORT
 * values. It now reads the definer function `carrier_public_identity(slug)`,
 * which returns FIVE public fields and nothing else: legal name, applicant
 * locality, USDOT, MC and the slug.
 *
 * There is no fallback. When the lookup fails, `identity` is null and the caller
 * says so instead of printing some other carrier's details.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  identityFromProfile,
  type CompanyIdentity,
  type PublicCarrierIdentityRow,
} from '../../../supabase/functions/_shared/application/identity';

export * from '../../../supabase/functions/_shared/application/identity';

export type CarrierIdentityStatus = 'loading' | 'ready' | 'not_found' | 'error';

export interface CarrierIdentityState {
  status: CarrierIdentityStatus;
  identity: CompanyIdentity | null;
  /** The carrier's own slug, once known — used to canonicalise the URL. */
  slug: string | null;
}

const LOADING: CarrierIdentityState = { status: 'loading', identity: null, slug: null };

function toState(row: PublicCarrierIdentityRow | null | undefined): CarrierIdentityState {
  if (!row) return { status: 'not_found', identity: null, slug: null };
  const identity = identityFromProfile(row);
  if (!identity) return { status: 'error', identity: null, slug: row.apply_slug ?? null };
  return { status: 'ready', identity, slug: row.apply_slug ?? null };
}

function firstRow(data: unknown): PublicCarrierIdentityRow | null {
  if (Array.isArray(data)) return (data[0] as PublicCarrierIdentityRow) ?? null;
  return (data as PublicCarrierIdentityRow) ?? null;
}

/**
 * Resolves a carrier from its apply slug.
 *
 * `slug` omitted is the BARE /apply route: the function returns the sole carrier
 * while exactly one exists, and NO ROW once there are two or more. It never
 * guesses — the applicant is asked for his carrier's link instead.
 */
export async function fetchCarrierIdentityBySlug(slug?: string | null): Promise<CarrierIdentityState> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)('carrier_public_identity', {
    p_slug: slug ?? null,
  });
  if (error) return { status: 'error', identity: null, slug: null };
  return toState(firstRow(data));
}

/** Same five fields, for a returning applicant who holds a draft token. */
export async function fetchCarrierIdentityForDraft(draftToken: string): Promise<CarrierIdentityState> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)('carrier_identity_for_draft', {
    p_draft_token: draftToken,
  });
  if (error) return { status: 'error', identity: null, slug: null };
  return toState(firstRow(data));
}

const CarrierIdentityContext = createContext<CarrierIdentityState | null>(null);

/** Supplies one resolved carrier to every document rendered beneath it. */
export function CarrierIdentityProvider({
  value,
  children,
}: {
  value: CarrierIdentityState;
  children: ReactNode;
}) {
  return <CarrierIdentityContext.Provider value={value}>{children}</CarrierIdentityContext.Provider>;
}

/**
 * The carrier whose identity belongs on this document, or null when it could not
 * be resolved. Callers MUST handle null rather than print anything.
 *
 * Inside a provider (the public form) it is the carrier of the link that was
 * used. Outside one (staff screens, signed in) it is the viewer's own carrier,
 * read from carrier_profile under RLS.
 */
export function useCompanyIdentity(): CompanyIdentity | null {
  return useCarrierIdentityState().identity;
}

/** The same resolution, with its status — for screens that explain a failure. */
export function useCarrierIdentityState(): CarrierIdentityState {
  const provided = useContext(CarrierIdentityContext);
  const [own, setOwn] = useState<CarrierIdentityState>(LOADING);

  useEffect(() => {
    if (provided) return;
    let cancelled = false;
    supabase
      .from('carrier_profile')
      .select('legal_name, applicant_locality, usdot_number, mc_number, apply_slug')
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        setOwn(error ? { status: 'error', identity: null, slug: null } : toState(data));
      });
    return () => { cancelled = true; };
  }, [provided]);

  return provided ?? own;
}
