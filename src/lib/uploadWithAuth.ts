import { supabase } from '@/integrations/supabase/client';
import { withTimeout } from '@/lib/withTimeout';

/**
 * Uploads a file to Supabase Storage with:
 *   - Proactive session refresh when the JWT is missing or near expiry
 *   - One-shot retry on RLS/JWT failures after a forced refreshSession()
 *   - 60s timeout wrapper (same as prior direct calls)
 *
 * Returns `{ data, error, authUid }` — `authUid` is included so callers can
 * log the resolved auth.uid() at failure time for easier field diagnosis.
 */
export interface UploadWithAuthResult {
  data: { path: string } | null;
  error: Error | null;
  authUid: string | null;
  sessionExpired?: boolean;
}

function isAuthLikeError(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes('row-level security') ||
    m.includes('row level security') ||
    m.includes('jwt') ||
    m.includes('unauthorized') ||
    m.includes('not authenticated')
  );
}

async function ensureFreshSession(): Promise<{ userId: string | null; expired: boolean }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    // Try one refresh in case a token exists in storage but wasn't hydrated
    const { data: refreshed } = await supabase.auth.refreshSession();
    return { userId: refreshed.session?.user?.id ?? null, expired: !refreshed.session };
  }
  const expiresAt = session.expires_at ?? 0;
  const nowSec = Math.floor(Date.now() / 1000);
  if (expiresAt - nowSec < 60) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    return { userId: refreshed.session?.user?.id ?? session.user.id, expired: !refreshed.session };
  }
  return { userId: session.user.id, expired: false };
}

export async function uploadToBucket(
  bucket: string,
  path: string,
  file: File | Blob,
  options: { upsert?: boolean; contentType?: string } = {},
): Promise<UploadWithAuthResult> {
  const pre = await ensureFreshSession();
  if (pre.expired || !pre.userId) {
    return {
      data: null,
      error: new Error('Your session expired. Please sign in again to upload.'),
      authUid: null,
      sessionExpired: true,
    };
  }

  const attempt = () =>
    withTimeout(
      supabase.storage.from(bucket).upload(path, file, {
        upsert: options.upsert ?? false,
        contentType: options.contentType,
      }),
      60_000,
      'Upload',
    );

  const first = await attempt();
  if (!first.error) {
    return { data: first.data as { path: string }, error: null, authUid: pre.userId };
  }

  const firstMsg = first.error.message ?? String(first.error);
  if (!isAuthLikeError(firstMsg)) {
    return { data: null, error: first.error as Error, authUid: pre.userId };
  }

  // Forced refresh + one-shot retry
  const { data: refreshed } = await supabase.auth.refreshSession();
  const retryUid = refreshed.session?.user?.id ?? null;
  if (!retryUid) {
    return {
      data: null,
      error: new Error('Your session expired. Please sign in again to upload.'),
      authUid: null,
      sessionExpired: true,
    };
  }

  const second = await attempt();
  if (!second.error) {
    return { data: second.data as { path: string }, error: null, authUid: retryUid };
  }
  return { data: null, error: second.error as Error, authUid: retryUid };
}