import { supabase } from '@/integrations/supabase/client';

const BUCKET = 'resource-library';

/**
 * Extracts the object path for a file stored in the (private) resource-library
 * bucket. Historic rows store legacy `/object/public/resource-library/...`
 * URLs; newer rows may store bare paths.
 */
export function extractResourcePath(url: string | null | undefined): string | null {
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) return url.replace(/^\/+/, '');
  for (const marker of [
    `/storage/v1/object/public/${BUCKET}/`,
    `/storage/v1/object/sign/${BUCKET}/`,
    `/object/public/${BUCKET}/`,
    `/object/sign/${BUCKET}/`,
  ]) {
    const idx = url.indexOf(marker);
    if (idx !== -1) return decodeURIComponent(url.slice(idx + marker.length).split('?')[0]);
  }
  return null;
}

/**
 * Resolves a stored resource-library reference into a short-lived signed URL.
 * Non resource-library URLs are returned unchanged.
 */
export async function resolveResourceUrl(
  url: string | null | undefined,
  expiresIn = 3600,
): Promise<string | null> {
  if (!url) return null;
  const path = extractResourcePath(url);
  if (!path) return url;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) {
    console.error('[resolveResourceUrl] failed to sign', path, error);
    return null;
  }
  return data.signedUrl;
}
