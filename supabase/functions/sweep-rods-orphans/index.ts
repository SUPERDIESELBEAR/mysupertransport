/**
 * Orphan sweep for the rods-logs bucket — a REACHABILITY check, deliberately
 * separate from the per-day purge.
 *
 * An object is an orphan only if no rods_days row references it in any of its
 * three path columns. Prefix matching is never used: an amendment and its
 * original share a `<operator_id>/<log_date>/` folder, so a prefix is not a
 * safe unit of deletion.
 *
 * Defaults to a dry run. Pass { apply: true } to actually delete.
 */
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { requireStaff, ok, fail, withErrorEnvelope } from '../_shared/email/index.ts'

const RODS_BUCKET = 'rods-logs'

// A purge whose caller never confirmed storage removal. Its paths are already
// named in the audit trail, so these are KNOWN orphans -- no inference needed.
const DEFAULT_PENDING_MINUTES = 60

async function listAll(
  supabase: { storage: { from: (b: string) => { list: (p: string, o: Record<string, unknown>) => Promise<{ data: Array<{ name: string; id: string | null }> | null; error: { message: string } | null }> } } },
  prefix: string,
  out: string[],
) {
  let offset = 0
  for (;;) {
    const { data, error } = await supabase.storage
      .from(RODS_BUCKET)
      .list(prefix, { limit: 100, offset })
    if (error) throw new Error(error.message)
    const rows = data ?? []
    for (const entry of rows) {
      const full = prefix ? `${prefix}/${entry.name}` : entry.name
      // A null id means a synthetic folder entry, not an object.
      if (entry.id === null) await listAll(supabase, full, out)
      else out.push(full)
    }
    if (rows.length < 100) break
    offset += rows.length
  }
}

Deno.serve(withErrorEnvelope(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const auth = await requireStaff(req, { roles: ['management', 'owner'] })
  if (auth instanceof Response) return auth
  const { supabase } = auth

  let apply = false
  let pendingMinutes = DEFAULT_PENDING_MINUTES
  try {
    const body = await req.json()
    apply = body?.apply === true
    if (typeof body?.pendingMinutes === 'number' && body.pendingMinutes >= 0) {
      pendingMinutes = body.pendingMinutes
    }
  } catch {
    // no body: dry run
  }

  // 1. Purges that never reported back. Cheaper than the reachability scan and
  //    strictly more actionable: the paths are recorded, not inferred.
  const cutoff = new Date(Date.now() - pendingMinutes * 60_000).toISOString()
  const { data: pendingRows, error: pendingError } = await supabase
    .from('audit_log')
    .select('id, entity_id, entity_label, created_at, metadata')
    .eq('action', 'rods_day_purged')
    .eq('metadata->>storage_disposition', 'pending_caller')
    .lt('created_at', cutoff)
    .order('created_at', { ascending: true })
  if (pendingError) return fail(500, 'Could not read the purge audit trail', pendingError.message)

  const incompletePurges = ((pendingRows ?? []) as Array<Record<string, any>>).map((r) => ({
    audit_id: r.id as string,
    day_id: r.entity_id as string,
    log_date: (r.metadata?.log_date ?? r.entity_label ?? null) as string | null,
    operator_id: (r.metadata?.operator_id ?? null) as string | null,
    reason: (r.metadata?.reason ?? null) as string | null,
    storage_owner: (r.metadata?.storage_owner ?? null) as string | null,
    recorded_at: r.created_at as string,
    age_minutes: Math.round((Date.now() - new Date(r.created_at as string).getTime()) / 60_000),
    storage_paths: (Array.isArray(r.metadata?.storage_paths) ? r.metadata.storage_paths : []) as string[],
  }))

  const { data: rows, error: rowsError } = await supabase
    .from('rods_days')
    .select('pdf_path, certification_signature_path, source_document_path')
  if (rowsError) return fail(500, 'Could not read duty-status logs', rowsError.message)

  const referenced = new Set<string>()
  for (const r of (rows ?? []) as Array<Record<string, string | null>>) {
    for (const p of [r.pdf_path, r.certification_signature_path, r.source_document_path]) {
      if (p) referenced.add(p)
    }
  }

  const objects: string[] = []
  await listAll(supabase as never, '', objects)
  const present = new Set(objects)
  const orphans = objects.filter((name) => !referenced.has(name))

  // Flag which of the recorded paths are still sitting in the bucket.
  const incomplete = incompletePurges.map((p) => ({
    ...p,
    still_present: p.storage_paths.filter((path) => present.has(path)),
  }))

  if (!apply || orphans.length === 0) {
    if (!apply) {
      return ok({
        applied: false,
        scanned: objects.length,
        referenced: referenced.size,
        orphans,
        incompletePurges: incomplete,
      })
    }
  }

  // Apply run. Recorded paths first, so their audit rows can be closed out.
  const closed: string[] = []
  for (const p of incomplete) {
    if (p.still_present.length > 0) {
      const { error: rmError } = await supabase.storage.from(RODS_BUCKET).remove(p.still_present)
      if (rmError) {
        console.error('[sweep-rods-orphans] late removal failed', p.audit_id, rmError.message)
        continue
      }
    }
    const { error: recError } = await supabase.rpc('record_rods_purge_storage_result', {
      _audit_id: p.audit_id,
      _removed: p.still_present,
      _failed: [],
      _late: true,
    })
    if (recError) console.error('[sweep-rods-orphans] audit close-out failed', p.audit_id, recError.message)
    else closed.push(p.audit_id)
  }

  const lateRemoved = new Set(incomplete.flatMap((p) => p.still_present))
  const remaining = orphans.filter((o) => !lateRemoved.has(o))

  let removed: string[] = [...lateRemoved]
  if (remaining.length > 0) {
    const { data: rm, error: rmError } = await supabase.storage.from(RODS_BUCKET).remove(remaining)
    if (rmError) return fail(500, 'Orphan deletion failed', rmError.message)
    removed = removed.concat((rm ?? []).map((o: { name: string }) => o.name))
  }

  return ok({
    applied: true,
    scanned: objects.length,
    referenced: referenced.size,
    removed,
    incompletePurges: incomplete,
    closedAuditRows: closed,
  })
}, 'sweep-rods-orphans'))