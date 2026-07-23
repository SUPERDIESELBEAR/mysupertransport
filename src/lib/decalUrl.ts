import { supabase } from '@/integrations/supabase/client';

const BUCKET = 'operator-documents';

function stripQuery(path: string): string {
  const q = path.indexOf('?');
  return q === -1 ? path : path.slice(0, q);
}

function decodePath(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

function extractOperatorDocumentPath(storedUrl: string): string | null {
  const trimmed = storedUrl.trim();
  if (!trimmed) return null;

  // Bare operator-documents path: "{operator_uuid}/decal_photos/..."
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//i.test(trimmed)) {
    return decodePath(stripQuery(trimmed));
  }

  // Bucket-prefixed path: "operator-documents/{operator_uuid}/decal_photos/..."
  if (trimmed.startsWith(`${BUCKET}/`)) {
    return decodePath(stripQuery(trimmed.slice(BUCKET.length + 1)));
  }

  try {
    const url = new URL(trimmed, window.location.origin);
    const pathname = url.pathname;
    const markerPatterns = [
      `/storage/v1/object/sign/${BUCKET}/`,
      `/storage/v1/object/public/${BUCKET}/`,
      `/object/sign/${BUCKET}/`,
      `/object/public/${BUCKET}/`,
      `/${BUCKET}/`,
    ];

    for (const marker of markerPatterns) {
      const idx = pathname.indexOf(marker);
      if (idx !== -1) {
        return decodePath(pathname.slice(idx + marker.length));
      }
    }
  } catch {
    const marker = `/${BUCKET}/`;
    const idx = trimmed.indexOf(marker);
    if (idx !== -1) return decodePath(stripQuery(trimmed.slice(idx + marker.length)));
  }

  return null;
}

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
  const path = extractOperatorDocumentPath(storedUrl);
  if (!path) return storedUrl; // not one of ours — pass through

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) {
    // Re-signing failed (permission, transient, missing object).
    console.warn('[resolveDecalUrl] failed to sign', path, error);
    // If the stored value is a bare path we can't render it directly — return null
    // so the caller shows a "photo unavailable" tile instead of a broken image.
    const isBarePath = !/^https?:/i.test(storedUrl.trim());
    return isBarePath ? null : storedUrl;
  }
  return data.signedUrl;
}
