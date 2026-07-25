import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

type SignatureUrlState = {
  url: string | null;
  loading: boolean;
  error: Error | null;
};

/**
 * Resolves a value stored in `driver_signature_data_url` (which may be a
 * storage path in the `signatures` bucket, a full URL, or a data URL) into
 * a browser-loadable image src.
 */
export function useSignatureUrl(value: string | null | undefined): SignatureUrlState {
  const [state, setState] = useState<SignatureUrlState>({ url: null, loading: false, error: null });

  useEffect(() => {
    let cancelled = false;
    if (!value) {
      setState({ url: null, loading: false, error: null });
      return;
    }
    if (value.startsWith('data:') || value.startsWith('http://') || value.startsWith('https://')) {
      setState({ url: value, loading: false, error: null });
      return;
    }
    setState({ url: null, loading: true, error: null });
    (async () => {
      const { data, error } = await supabase.storage
        .from('signatures')
        .createSignedUrl(value, 3600);
      if (cancelled) return;
      if (error) {
        console.error('[useSignatureUrl] failed to sign', value, error);
        setState({ url: null, loading: false, error: error instanceof Error ? error : new Error('Could not create signature URL') });
        return;
      }
      setState({ url: data?.signedUrl ?? null, loading: false, error: null });
    })();
    return () => { cancelled = true; };
  }, [value]);

  return state;
}