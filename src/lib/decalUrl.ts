import { supabase } from '@/integrations/supabase/client';

const BUCKET = 'operator-documents';

/**
 * Some decal photo URLs were persisted as short-lived signed URLs
 * (/object/sign/...) or as /object/public/... URLs against a bucket that
 * is actually private. Both break over time. This helper extracts the
 * object path and mints a fresh signed URL at read time.
 *
 * If the input isn't a Supabase storage URL for `operator-documents`,
 * it's returned unchanged so external URLs still render.
 */
export async function resolveDecalUrl(storedUrl: string | null | undefined): Promise<string | null> {
  if (!storedUrl) return null;
  const marker = `/${BUCKET}/`;
  const idx = storedUrl.indexOf(marker);
  if (idx === -1) return storedUrl; // not one of ours — pass through

  let path = storedUrl.slice(idx + marker.length);
  // strip any query string (e.g. ?token=...) that came from a stale signed URL
  const q = path.indexOf('?');
  if (q !== -1) path = path.slice(0, q);
  if (!path) return null;

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) {
    // Re-signing failed (permission, transient, etc). Fall back to the stored URL —
    // many of our older records are long-lived signed URLs that still work directly.
    return storedUrl;
  }
  return data.signedUrl;
}
