import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

type SignatureUrlState = {
  url: string | null;
  loading: boolean;
  error: Error | null;
  blank: boolean;
};

const INK_ALPHA_THRESHOLD = 16;
const INK_CHANNEL_THRESHOLD = 245;

async function imageHasVisibleInk(src: string): Promise<boolean> {
  if (typeof document === 'undefined') return true;

  const response = await fetch(src);
  if (!response.ok) throw new Error('Could not load signature image');
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not decode signature image'));
      img.src = objectUrl;
    });

    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (!width || !height) return false;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return true;
    ctx.drawImage(image, 0, 0);
    const { data } = ctx.getImageData(0, 0, width, height);

    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      const red = data[i];
      const green = data[i + 1];
      const blue = data[i + 2];
      if (
        alpha > INK_ALPHA_THRESHOLD
        && (red < INK_CHANNEL_THRESHOLD || green < INK_CHANNEL_THRESHOLD || blue < INK_CHANNEL_THRESHOLD)
      ) {
        return true;
      }
    }

    return false;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Resolves a value stored in `driver_signature_data_url` (which may be a
 * storage path in the `signatures` bucket, a full URL, or a data URL) into
 * a browser-loadable image src.
 */
export function useSignatureUrl(value: string | null | undefined): SignatureUrlState {
  const [state, setState] = useState<SignatureUrlState>({ url: null, loading: false, error: null, blank: false });

  useEffect(() => {
    let cancelled = false;
    if (!value) {
      setState({ url: null, loading: false, error: null, blank: false });
      return;
    }
    if (value.startsWith('data:') || value.startsWith('http://') || value.startsWith('https://')) {
      setState({ url: value, loading: true, error: null, blank: false });
      (async () => {
        try {
          const hasInk = await imageHasVisibleInk(value);
          if (cancelled) return;
          setState({ url: hasInk ? value : null, loading: false, error: null, blank: !hasInk });
        } catch (error) {
          if (cancelled) return;
          console.error('[useSignatureUrl] failed to validate image', error);
          setState({ url: value, loading: false, error: null, blank: false });
        }
      })();
      return;
    }
    setState({ url: null, loading: true, error: null, blank: false });
    (async () => {
      const { data, error } = await supabase.storage
        .from('signatures')
        .createSignedUrl(value, 3600);
      if (cancelled) return;
      if (error) {
        console.error('[useSignatureUrl] failed to sign', value, error);
        setState({ url: null, loading: false, error: error instanceof Error ? error : new Error('Could not create signature URL'), blank: false });
        return;
      }
      const signedUrl = data?.signedUrl ?? null;
      if (!signedUrl) {
        setState({ url: null, loading: false, error: null, blank: false });
        return;
      }
      try {
        const hasInk = await imageHasVisibleInk(signedUrl);
        if (cancelled) return;
        setState({ url: hasInk ? signedUrl : null, loading: false, error: null, blank: !hasInk });
      } catch (validationError) {
        if (cancelled) return;
        console.error('[useSignatureUrl] failed to validate signed image', validationError);
        setState({ url: signedUrl, loading: false, error: null, blank: false });
      }
    })();
    return () => { cancelled = true; };
  }, [value]);

  return state;
}