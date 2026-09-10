/**
 * Resolves where a binder document actually lives in storage.
 *
 * Two sources of truth, in priority order:
 *  1. the saved file_url — a signed/public storage URL names its bucket explicitly,
 *     so it is always trusted over guessing from the path text;
 *  2. the file_path — legacy rows were written with the bucket name baked into the
 *     path ("fleet-documents/driver/..."), and that prefix is both a wrong bucket
 *     hint AND not part of the object key, so it must be stripped.
 *
 * Historic bug this fixes: 87 inspection_documents rows carry a "fleet-documents/"
 * prefix while the object actually sits in inspection-documents (78) or
 * operator-documents (9). The viewer followed file_url and worked; the editor
 * re-derived from file_path and failed on both bucket and key.
 */

const KNOWN_BUCKETS = [
  'inspection-documents',
  'application-documents',
  'operator-documents',
  'fleet-documents',
  'driver-uploads',
  'company-documents',
] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//i;

export interface BinderStorageRef {
  bucket: string;
  path: string;
}

/** Parses a signed/public Supabase storage URL into bucket + object key. */
export function parseStorageUrl(rawUrl: string | null | undefined): BinderStorageRef | null {
  if (!rawUrl || !/^https?:\/\//i.test(rawUrl)) return null;
  const match = rawUrl.match(
    /\/storage\/v1\/object\/(?:sign|public|authenticated)\/([^/?]+)\/(.+?)(?:\?|$)/i,
  );
  if (!match) return null;
  const bucket = decodeURIComponent(match[1]);
  const path = decodeURIComponent(match[2]);
  if (!bucket || !path) return null;
  return { bucket, path };
}

/** Derives bucket + object key from a bare stored path. */
export function resolvePathOnly(filePath: string | null | undefined): BinderStorageRef | null {
  if (!filePath) return null;
  let path = filePath.replace(/^\/+/, '');

  // Legacy rows with the bucket name baked into the path.
  for (const bucket of KNOWN_BUCKETS) {
    if (path.toLowerCase().startsWith(`${bucket}/`)) {
      return { bucket, path: path.slice(bucket.length + 1) };
    }
  }

  // Application-sourced docs.
  if (/^applications\//i.test(path)) return { bucket: 'application-documents', path };

  // Vehicle Hub DOT inspection certificates: "<operator_uuid>/dot/<file>"
  if (UUID_RE.test(path) && /^[^/]+\/dot\//i.test(path)) {
    return { bucket: 'fleet-documents', path };
  }

  // Operator-uploaded docs: "<operator_uuid>/..."
  if (UUID_RE.test(path)) return { bucket: 'operator-documents', path };

  return { bucket: 'inspection-documents', path };
}

/**
 * Single resolver used by the binder list, viewer, flipbook and editor so a
 * document behaves identically everywhere.
 */
export function resolveBinderStorage(
  fileUrl: string | null | undefined,
  filePath: string | null | undefined,
): BinderStorageRef | null {
  return parseStorageUrl(fileUrl) ?? resolvePathOnly(filePath);
}
