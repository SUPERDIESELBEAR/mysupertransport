/**
 * Purge a record of duty status, then delete the artifacts THAT ROW owns.
 *
 * Storage deletion has to happen here, not in `purge_rods_day`: direct DELETE
 * from `storage.objects` is blocked by `storage.protect_delete()`, and removing
 * the row without the Storage API would strand the bytes.
 *
 * Only the three explicit paths the row owns are deleted — pdf_path,
 * certification_signature_path, source_document_path. NEVER a
 * `<operator_id>/<log_date>/` prefix: an amendment and its original share a
 * log_date, so a prefix sweep would delete the surviving original's signature
 * and PDF while that row is still a retained record under 49 CFR 395.8(k)(1).
 *
 * Storage failures are recorded and non-blocking. The row purge is the
 * compliance-relevant part and must not be undone by a stuck object.
 */
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { requireStaff, ok, fail, withErrorEnvelope } from '../_shared/email/index.ts'

const RODS_BUCKET = 'rods-logs'

Deno.serve(withErrorEnvelope(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const auth = await requireStaff(req, { roles: ['management', 'owner'] })
  if (auth instanceof Response) return auth
  // `requireStaff` hands back a SERVICE-ROLE client, so `auth.uid()` is null
  // inside `purge_rods_day`. The human's id is passed explicitly as
  // `_actor_id` so the purge audit row attributes to a person.
  const { supabase, userId } = auth

  let body: { dayIds?: unknown; reason?: unknown }
  try {
    body = await req.json()
  } catch {
    return fail(400, 'Invalid JSON body')
  }

  const dayIds = Array.isArray(body.dayIds)
    ? body.dayIds.filter((v): v is string => typeof v === 'string' && v.length > 0)
    : []
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''

  if (dayIds.length === 0) return fail(400, 'dayIds must be a non-empty array of log ids')
  if (reason.length < 12) {
    return fail(400, 'A written reason of at least 12 characters is required to purge a record of duty status.')
  }

  const results: Array<Record<string, unknown>> = []

  // Caller controls ordering. An amendment must be purged before the original
  // it supersedes: rods_days.supersedes_day_id and
  // rods_amendments.original_day_id both point at the original and neither is
  // deferrable.
  for (const dayId of dayIds) {
    const { data, error } = await supabase.rpc('purge_rods_day', {
      _day_id: dayId,
      _reason: reason,
      // Required. The SQL function cannot remove objects itself, so the caller
      // must name itself as the party that will.
      _storage_owner: 'purge-rods-day edge function',
      _actor_id: userId,
    })
    if (error) {
      results.push({ day_id: dayId, purged: false, error: error.message })
      continue
    }

    const payload = (data ?? {}) as {
      audit_id?: string
      storage_paths?: string[]
      storage_disposition?: string
    }
    const paths = Array.isArray(payload.storage_paths) ? payload.storage_paths : []
    const removed: string[] = []
    const failed: Array<{ path: string; error: string }> = []

    if (paths.length > 0) {
      const { data: rm, error: rmError } = await supabase.storage.from(RODS_BUCKET).remove(paths)
      if (rmError) {
        for (const p of paths) failed.push({ path: p, error: rmError.message })
      } else {
        const okPaths = new Set((rm ?? []).map((o: { name: string }) => o.name))
        for (const p of paths) {
          if (okPaths.has(p)) removed.push(p)
          else failed.push({ path: p, error: 'not found or not removed' })
        }
      }

      if (payload.audit_id) {
        const { error: recError } = await supabase.rpc('record_rods_purge_storage_result', {
          _audit_id: payload.audit_id,
          _removed: removed,
          _failed: failed,
        })
        if (recError) console.error('[purge-rods-day] audit metadata update failed', recError)
      }
    }

    results.push({ day_id: dayId, purged: true, storage_removed: removed, storage_failed: failed })
  }

  return ok({ results })
}, 'purge-rods-day'))