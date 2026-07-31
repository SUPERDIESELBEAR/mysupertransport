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
  try {
    const body = await req.json()
    apply = body?.apply === true
  } catch {
    // no body: dry run
  }

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
  const orphans = objects.filter((name) => !referenced.has(name))

  if (!apply || orphans.length === 0) {
    return ok({ applied: false, scanned: objects.length, referenced: referenced.size, orphans })
  }

  const { data: rm, error: rmError } = await supabase.storage.from(RODS_BUCKET).remove(orphans)
  if (rmError) return fail(500, 'Orphan deletion failed', rmError.message)

  return ok({
    applied: true,
    scanned: objects.length,
    referenced: referenced.size,
    removed: (rm ?? []).map((o: { name: string }) => o.name),
  })
}, 'sweep-rods-orphans'))