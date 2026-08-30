/**
 * Browser-side view of the carrier identity used on application documents.
 *
 * Canonical location: supabase/functions/_shared/application/identity.ts
 * The re-export keeps a single definition so the letterhead the applicant
 * signs and the letterhead the PDF renderer draws can never disagree.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  DEFAULT_COMPANY_IDENTITY,
  identityFromProfile,
  type CompanyIdentity,
} from '../../../supabase/functions/_shared/application/identity';

export * from '../../../supabase/functions/_shared/application/identity';

/**
 * Reads carrier_profile when the viewer is allowed to, and falls back to the
 * constants otherwise.
 *
 * Applicants are anonymous on /apply and cannot select carrier_profile, so the
 * fallback is the normal path there, not an error case — a disclosure form must
 * still carry the company's name and DOT number for someone who has not signed
 * in yet.
 */
export function useCompanyIdentity(): CompanyIdentity {
  const [identity, setIdentity] = useState<CompanyIdentity>(DEFAULT_COMPANY_IDENTITY);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('carrier_profile')
      .select('legal_name, usdot_number, mc_number')
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) setIdentity(identityFromProfile(data));
      });
    return () => { cancelled = true; };
  }, []);

  return identity;
}
