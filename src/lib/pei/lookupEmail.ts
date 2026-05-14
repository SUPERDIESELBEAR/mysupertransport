import { supabase } from '@/integrations/supabase/client';

export interface EmailCandidate {
  email: string;
  label: string;
  source_url: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface LookupEmailResult {
  website?: string;
  domain?: string;
  candidates: EmailCandidate[];
  reason?: string;
}

export async function lookupEmployerEmail(input: {
  employer_name: string;
  city?: string | null;
  state?: string | null;
}): Promise<LookupEmailResult> {
  const { data, error } = await supabase.functions.invoke('lookup-employer-email', {
    body: input,
  });
  if (error) throw new Error(error.message ?? 'Lookup failed');
  return data as LookupEmailResult;
}