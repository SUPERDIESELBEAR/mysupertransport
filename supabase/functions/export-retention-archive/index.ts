/**
 * §6 — Retention archive export.
 *
 * Server-side on purpose. The audit write and the `is_demo = false` default
 * predicate are the two things an export must never be able to skip, and a
 * client-side assembler skips both by simply not calling them. Here the audit
 * row is written BEFORE any bytes exist, so an export that fails half way
 * still leaves a record that it was attempted.
 *
 * Fidelity rule: NOTHING is recompressed, downsampled or dropped to make a
 * file fit. `buildOfficerPacket` downsamples photos because an officer's
 * roadside copy is a convenience artifact; a retention export is the federal
 * record itself. When the set is too large the export SPLITS into parts, and
 * when it is too large to split it REFUSES and asks for a narrower range.
 */
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { PDFDocument, StandardFonts, degrees, rgb } from 'npm:pdf-lib@1.17.1'
import { requireStaff, ok, fail, withErrorEnvelope } from '../_shared/email/index.ts'
import { orderVersionsByDate } from '../_shared/eld/amendmentChain.ts'
import { drawDemoWatermark } from '../_shared/demoWatermark.ts'

/**
 * Soft ceiling per output document. Splitting happens on a driver or whole
 * date boundary only — never inside a date's amendment chain, so no version is
 * ever separated from the chain it belongs to.
 */
const PART_CEILING_BYTES = 40 * 1024 * 1024

/**
 * Hard ceiling on the REQUEST, not the file. A merge that runs out of memory
 * mid-assembly produces a truncated federal record, which is worse than a
 * refusal. At ~300 KB a certified day this is roughly a driver-year.
 */
const MAX_ARTIFACTS = 400

const A4: [number, number] = [595.28, 841.89]
const MARGIN = 48
const GOLD = rgb(0.788, 0.659, 0.298)
const INK = rgb(0.051, 0.051, 0.051)
const GREY = rgb(0.42, 0.42, 0.42)

/** Standard fonts are WinAnsi and drawText throws outside it. */
function wa(text: string): string {
  return String(text ?? '')
    .replace(/[\u2192\u2794]/g, '->')
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[^\u0020-\u007E\u00A0-\u00FF]/g, '?')
}

interface ArtifactRow {
  artifact_type: string
  artifact_id: string
  operator_id: string | null
  log_date: string | null
  occurred_at: string | null
  status: string | null
  label: string | null
  truck_number: string | null
  supersedes_day_id: string | null
  event_id: string | null
  storage_bucket: string | null
  storage_path: string | null
  is_demo: boolean
}

Deno.serve(withErrorEnvelope(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const auth = await requireStaff(req, { roles: ['management', 'owner'] })
  if (auth instanceof Response) return auth
  // `requireStaff` hands back a SERVICE-ROLE client. The retention RPCs gate on
  // `is_retention_admin(auth.uid())`, and auth.uid() is null under service role,
  // so the searches and the audit write go through a user-scoped client. That
  // keeps the definer gate live instead of quietly bypassing it, and it makes
  // the audit row attribute to the human who asked for the export.
  const admin = auth.supabase
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: auth.authHeader } }, auth: { persistSession: false } },
  )

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return fail(400, 'Invalid JSON body') }

  const kind = body.kind === 'timeline' ? 'timeline' : 'archive'
  const operatorIds = Array.isArray(body.operatorIds)
    ? (body.operatorIds as unknown[]).filter((v): v is string => typeof v === 'string' && v.length > 0)
    : []
  const from = typeof body.from === 'string' && body.from ? body.from : null
  const to = typeof body.to === 'string' && body.to ? body.to : null
  const truck = typeof body.truck === 'string' && (body.truck as string).trim() ? (body.truck as string).trim() : null
  const eventId = typeof body.eventId === 'string' && body.eventId ? body.eventId : null
  const status = typeof body.status === 'string' && body.status ? body.status : null
  const includeDemo = body.includeDemo === true

  if (kind === 'timeline' && !eventId) return fail(400, 'eventId is required for a timeline export')

  // ---------------------------------------------------------------- resolve
  let artifacts: ArtifactRow[] = []
  let timeline: Array<Record<string, unknown>> = []

  if (kind === 'timeline') {
    const { data, error } = await supabase.rpc('get_eld_compliance_timeline', { _event_id: eventId })
    if (error) return fail(400, `Could not read the compliance timeline: ${error.message}`)
    timeline = (data ?? []) as Array<Record<string, unknown>>
    if (timeline.length === 0) return fail(404, 'That malfunction event has no recorded timeline yet.')
  } else {
    const { data, error } = await supabase.rpc('search_retention_archive', {
      _operator_ids: operatorIds.length > 0 ? operatorIds : null,
      _from: from,
      _to: to,
      _truck: truck,
      _event_id: eventId,
      _status: status,
      _include_demo: includeDemo,
    })
    if (error) return fail(400, `Could not resolve the archive: ${error.message}`)
    artifacts = (data ?? []) as ArtifactRow[]
    if (artifacts.length === 0) return fail(404, 'Nothing matched that search, so there is nothing to export.')
    if (artifacts.length > MAX_ARTIFACTS) {
      return fail(
        413,
        `That range resolves to ${artifacts.length} records, above the ${MAX_ARTIFACTS}-record export limit. `
        + 'Nothing in a retention export is reduced in quality to make it fit, so narrow the range by driver or '
        + 'by dates and export in sequence instead.',
      )
    }
  }

  // Driver names for the covers.
  const opIds = [...new Set(
    (kind === 'timeline' ? [] : artifacts.map((a) => a.operator_id)).filter(Boolean) as string[],
  )]
  const names = new Map<string, string>()
  if (opIds.length > 0) {
    const { data: ops } = await admin.from('operators').select('id, user_id, unit_number').in('id', opIds)
    const userIds = (ops ?? []).map((o: { user_id: string | null }) => o.user_id).filter(Boolean) as string[]
    const profs = userIds.length > 0
      ? (await admin.from('profiles').select('user_id, first_name, last_name').in('user_id', userIds)).data ?? []
      : []
    const byUser = new Map(
      (profs as Array<{ user_id: string; first_name: string | null; last_name: string | null }>)
        .map((p) => [p.user_id, `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()]),
    )
    for (const o of (ops ?? []) as Array<{ id: string; user_id: string | null; unit_number: string | null }>) {
      names.set(o.id, byUser.get(o.user_id ?? '') || `Unit ${o.unit_number ?? '—'}`)
    }
  }

  // ------------------------------------------------------------- audit first
  const label = kind === 'timeline'
    ? `Compliance timeline export — event ${eventId}`
    : `Retention export — ${operatorIds.length || 'all'} driver(s) ${from ?? '…'} to ${to ?? '…'}`

  const artifactCount = kind === 'timeline' ? timeline.length : artifacts.length
  const { data: auditId, error: auditError } = await supabase.rpc('record_retention_export', {
    _kind: kind === 'timeline' ? 'eld_compliance_timeline_export' : 'rods_retention_export',
    _operator_ids: operatorIds.length > 0 ? operatorIds : null,
    _from: from,
    _to: to,
    _include_demo: includeDemo,
    _artifact_count: artifactCount,
    _parts: null,
    _label: label,
    _metadata: {
      event_id: eventId,
      truck_number: truck,
      status_filter: status,
      artifact_types: kind === 'timeline'
        ? ['compliance_timeline']
        : [...new Set(artifacts.map((a) => a.artifact_type))],
      demo_records: kind === 'timeline' ? null : artifacts.filter((a) => a.is_demo).length,
    },
  })
  if (auditError) {
    // No audit row means no export. An unaudited copy of a federal record
    // leaving the system is the one outcome this section exists to prevent.
    return fail(403, `Export refused: the audit record could not be written (${auditError.message}).`)
  }

  // ------------------------------------------------------------------ render
  const generatedAt = new Date()
  const anyDemo = kind === 'timeline' ? includeDemo : artifacts.some((a) => a.is_demo)

  async function drawCover(
    pdf: PDFDocument, partIndex: number, partTotal: number, contents: string[],
  ): Promise<void> {
    const page = pdf.addPage(A4)
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    const { width, height } = page.getSize()
    page.drawRectangle({ x: 0, y: height - 6, width, height: 6, color: GOLD })

    let y = height - MARGIN - 18
    const line = (t: string, size = 10, f = font, color = INK, gap = 15) => {
      page.drawText(wa(t), { x: MARGIN, y, size, font: f, color, maxWidth: width - MARGIN * 2 })
      y -= gap
    }
    line(kind === 'timeline' ? 'ELD MALFUNCTION COMPLIANCE TIMELINE' : 'RETENTION ARCHIVE EXPORT', 14, bold, INK, 24)
    line(
      operatorIds.length === 1 ? (names.get(operatorIds[0]) ?? 'Driver') : `${operatorIds.length || 'All'} driver(s)`,
      12, bold, INK, 16,
    )
    line(`Range ${from ?? 'earliest'} to ${to ?? 'latest'}`, 10, font, GREY, 14)
    line(`Generated ${generatedAt.toISOString()}`, 10, font, GREY, 14)
    line('Retained under 49 CFR 395.8(k)(1). Records are not deleted on a schedule.', 9, font, GREY, 14)
    if (includeDemo) line('INCLUDES DEMO RECORDS - recorded on the audit entry for this export.', 10, bold, INK, 18)
    line(`Part ${partIndex} of ${partTotal}`, 11, bold, INK, 18)
    line('CONTENTS', 11, bold, INK, 16)
    for (const c of contents.slice(0, 40)) line(c, 9, font, INK, 12)
    if (contents.length > 40) line(`... and ${contents.length - 40} more`, 9, font, GREY, 12)
  }

  async function drawTextPage(pdf: PDFDocument, title: string, lines: string[]): Promise<void> {
    let page = pdf.addPage(A4)
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    const width = A4[0]
    page.drawRectangle({ x: 0, y: A4[1] - 6, width, height: 6, color: GOLD })
    let y = A4[1] - MARGIN - 18
    page.drawText(wa(title), { x: MARGIN, y, size: 12, font: bold, color: INK, maxWidth: width - MARGIN * 2 })
    y -= 22
    for (const l of lines) {
      if (y < MARGIN + 20) {
        page = pdf.addPage(A4)
        page.drawRectangle({ x: 0, y: A4[1] - 6, width, height: 6, color: GOLD })
        y = A4[1] - MARGIN - 18
      }
      page.drawText(wa(l), { x: MARGIN, y, size: 9, font, color: INK, maxWidth: width - MARGIN * 2, lineHeight: 12 })
      y -= 14
    }
  }

  async function mergeStored(pdf: PDFDocument, bucket: string, path: string, title: string): Promise<boolean> {
    const { data, error } = await admin.storage.from(bucket).download(path)
    if (error || !data) {
      await drawTextPage(pdf, title, [
        'RECORD NOT INCLUDED',
        `The stored file could not be read (${error?.message ?? 'missing'}).`,
        'The record itself is retained; this page stands in so no date is silently absent.',
      ])
      return false
    }
    const bytes = new Uint8Array(await data.arrayBuffer())
    try {
      const donor = await PDFDocument.load(bytes, { ignoreEncryption: true })
      const pages = await pdf.copyPages(donor, donor.getPageIndices())
      pages.forEach((p) => pdf.addPage(p))
      return pages.length > 0
    } catch (err) {
      await drawTextPage(pdf, title, [
        'RECORD NOT INCLUDED',
        `The stored file could not be parsed as a PDF (${err instanceof Error ? err.message : String(err)}).`,
      ])
      return false
    }
  }

  // Units of assembly. A unit is never split across parts.
  interface Unit { render: (pdf: PDFDocument) => Promise<void> }
  const units: Unit[] = []
  const contents: string[] = []

  if (kind === 'timeline') {
    const rows = timeline as unknown as Array<{
      occurred_at: string; stage: string; label: string; detail: string | null
      storage_bucket: string | null; storage_path: string | null
    }>
    contents.push(...rows.map((r) => `${(r.occurred_at ?? '').slice(0, 19).replace('T', ' ')} - ${r.label}`))
    units.push({
      render: async (pdf) => {
        await drawTextPage(pdf, `Malfunction event ${eventId}`, rows.map((r) => (
          `${(r.occurred_at ?? '').slice(0, 19).replace('T', ' ')}  ${String(r.stage).toUpperCase()}  ${r.label}`
          + (r.detail ? `  -  ${r.detail}` : '')
        )))
        // The timeline stands on its own, so the documents it cites travel
        // with it — a stage that names a notice without the notice attached
        // proves nothing to an auditor.
        for (const r of rows) {
          if (r.storage_bucket && r.storage_path) {
            await mergeStored(pdf, r.storage_bucket, r.storage_path, r.label)
          }
        }
      },
    })
  } else {
    const dayRows = artifacts.filter((a) => a.artifact_type === 'rods_day')
    const others = artifacts.filter((a) => a.artifact_type !== 'rods_day')

    // Every version of a date, in supersession order, through the shared
    // helper. A one-level walk here would omit a middle amendment.
    for (const operatorId of [...new Set(dayRows.map((d) => d.operator_id))]) {
      const forOp = dayRows.filter((d) => d.operator_id === operatorId)
      const groups = orderVersionsByDate(
        forOp.map((d) => ({
          id: d.artifact_id,
          log_date: d.log_date ?? '',
          supersedes_day_id: d.supersedes_day_id,
          row: d,
        })),
      )
      const driver = names.get(operatorId ?? '') ?? 'Driver'
      for (const group of groups) {
        contents.push(`${driver} - ${group.log_date} - ${group.versions.length} version(s), original first`)
        units.push({
          render: async (pdf) => {
            for (let i = 0; i < group.versions.length; i++) {
              const row = group.versions[i].row
              const title = `${driver} - ${group.log_date} - version ${i + 1} of ${group.versions.length}`
                + (i === 0 ? ' (original)' : ' (amendment)')
              await drawTextPage(pdf, title, [
                `Status: ${row.status ?? '-'}`,
                `Certified: ${row.occurred_at ?? 'not certified'}`,
                `Truck: ${row.truck_number ?? '-'}`,
                row.is_demo ? 'DEMO RECORD' : '',
              ].filter(Boolean))
              if (row.storage_bucket && row.storage_path) {
                await mergeStored(pdf, row.storage_bucket, row.storage_path, title)
              }
            }
          },
        })
      }
    }

    if (others.length > 0) {
      contents.push(`Supporting records - ${others.length} entr(ies)`)
      units.push({
        render: async (pdf) => {
          await drawTextPage(pdf, 'Supporting retained records', others.map((o) => (
            `${(o.occurred_at ?? '').slice(0, 19).replace('T', ' ')}  ${o.artifact_type}  `
            + `${o.label ?? ''}  ${o.status ? `[${o.status}]` : ''}${o.is_demo ? '  (DEMO)' : ''}`
          )))
          for (const o of others) {
            if (o.storage_bucket && o.storage_path) {
              await mergeStored(pdf, o.storage_bucket, o.storage_path, o.label ?? o.artifact_type)
            }
          }
        },
      })
    }
  }

  // ---------------------------------------------------------- assemble/split
  const parts: Uint8Array[] = []
  let current = await PDFDocument.create()
  let currentHasBody = false

  for (const unit of units) {
    const before = currentHasBody ? await current.save() : null
    await unit.render(current)
    currentHasBody = true
    const after = await current.save()
    if (after.byteLength > PART_CEILING_BYTES && before) {
      // Roll the unit into a fresh part. Boundaries only ever fall between
      // units, so an amendment chain is never split.
      parts.push(before)
      current = await PDFDocument.create()
      await unit.render(current)
    }
  }
  if (currentHasBody) parts.push(await current.save())

  // Cover pages, now that the part count is known.
  const finalParts: Uint8Array[] = []
  for (let i = 0; i < parts.length; i++) {
    const withCover = await PDFDocument.create()
    await drawCover(withCover, i + 1, parts.length, contents)
    const donor = await PDFDocument.load(parts[i], { ignoreEncryption: true })
    const pages = await withCover.copyPages(donor, donor.getPageIndices())
    pages.forEach((p) => withCover.addPage(p))
    // Stamped last so the mark covers the cover, the summaries and every
    // merged donor page alike.
    if (anyDemo) {
      const font = await withCover.embedFont(StandardFonts.HelveticaBold)
      withCover.getPages().forEach((p) => drawDemoWatermark(p, font, rgb, degrees))
    }
    finalParts.push(await withCover.save())
  }

  // --------------------------------------------------------------- store/sign
  const exportId = crypto.randomUUID()
  const folder = operatorIds.length === 1 ? operatorIds[0] : 'fleet'
  const stored: Array<{ part: number; path: string; url: string | null; size: number }> = []
  for (let i = 0; i < finalParts.length; i++) {
    const path = `${folder}/retention-exports/${exportId}-part-${i + 1}.pdf`
    const { error: upErr } = await admin.storage.from('eld-notices')
      .upload(path, finalParts[i], { contentType: 'application/pdf', upsert: true })
    if (upErr) return fail(500, `Could not store the export: ${upErr.message}`)
    const { data: signed } = await admin.storage.from('eld-notices').createSignedUrl(path, 60 * 60)
    stored.push({ part: i + 1, path, url: signed?.signedUrl ?? null, size: finalParts[i].byteLength })
  }

  // One audit row per export request; a split is one audited export, not N.
  await admin.from('audit_log').update({
    metadata: {
      export_id: exportId,
      parts: stored.length,
      part_paths: stored.map((s) => s.path),
      total_bytes: stored.reduce((n, s) => n + s.size, 0),
      operator_ids: operatorIds.length > 0 ? operatorIds : null,
      date_from: from,
      date_to: to,
      include_demo: includeDemo,
      artifact_count: artifactCount,
      event_id: eventId,
    },
  }).eq('id', auditId as unknown as string)

  return ok({
    export_id: exportId,
    audit_id: auditId,
    parts: stored,
    artifact_count: artifactCount,
    include_demo: includeDemo,
  })
}, 'export-retention-archive'))
