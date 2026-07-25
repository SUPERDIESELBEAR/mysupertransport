import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Resolves a value stored in `driver_signature_data_url` (which may be a
 * storage path in the `signatures` bucket, a full URL, or a data URL) into
 * a browser-loadable image src.
 */
export function useSignatureUrl(value: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!value) { setUrl(null); return; }
    if (value.startsWith('data:') || value.startsWith('http://') || value.startsWith('https://')) {
      setUrl(value);
      return;
    }
    (async () => {
      const { data, error } = await supabase.storage
        .from('signatures')
        .createSignedUrl(value, 3600);
      if (cancelled) return;
      if (error) {
        console.error('[useSignatureUrl] failed to sign', value, error);
        setUrl(null);
        return;
      }
      setUrl(data?.signedUrl ?? null);
    })();
    return () => { cancelled = true; };
  }, [value]);

  return url;
}