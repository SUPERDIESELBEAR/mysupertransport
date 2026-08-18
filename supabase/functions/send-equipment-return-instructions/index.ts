import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { TEMPLATES } from '../_shared/transactional-email-templates/registry.ts'
import {
  requireStaff,
  ok,
  fail,
  withErrorEnvelope,
  sendTemplateEmail,
  buildAppUrl,
} from '../_shared/email/index.ts'

// Emails a driver the equipment-return mailing instructions for a specific
// Onboard Systems Assignment Sheet (OSAS), and stamps the sheet as "return
// requested" so the driver-side upload block unlocks.

const DEVICE_LABELS: Record<string, string> = {
  eld: 'ELD Unit',
  dash_cam: 'Dash Camera',
  bestpass: 'BestPass',
  fuel_card: 'Fuel Card',
  decal: 'Decal',
  license_plate: 'License Plate',
  registration: 'Truck Registration',
}

// Truck Registration stays with the truck — it is never mailed back.
const RETURNABLE_TYPES = new Set(['eld', 'dash_cam', 'bestpass', 'fuel_card', 'decal', 'license_plate'])

Deno.serve(withErrorEnvelope(async (req) => {
  const auth = await requireStaff(req, { roles: ['management', 'onboarding_staff', 'owner'] })
  if (auth instanceof Response) return auth
  const { supabase, authHeader, userId } = auth

  let body: { sheetId?: string; preview?: boolean }
  try {
    body = await req.json()
  } catch {
    return fail(400, 'Invalid JSON body')
  }
  if (!body.sheetId) return fail(400, 'sheetId is required')

  const { data: sheet, error: sheetError } = await supabase
    .from('onboard_assignment_sheets')
    .select(`
      id, operator_id, unit_number, return_requested_at,
      items:onboard_assignment_sheet_items(device_type, serial_snapshot),
      operator:operator_id(id, unit_number, applications(first_name, last_name, email))
    `)
    .eq('id', body.sheetId)
    .single()
  if (sheetError || !sheet) return fail(404, 'Assignment sheet not found', sheetError?.message)

  const app = (sheet as any).operator?.applications
  const email = app?.email
  if (!email) return fail(400, 'Driver has no email on file')

  const driverName = [app?.first_name, app?.last_name].filter(Boolean).join(' ').trim() || 'Driver'

  const items = ((sheet as any).items || [])
    .filter((it: any) => RETURNABLE_TYPES.has(it.device_type))
    .map((it: any) => ({
      label: DEVICE_LABELS[it.device_type] ?? it.device_type,
      serial: it.serial_snapshot || null,
    }))

  const portalUrl = buildAppUrl(`/operator/onboard-systems?sheet=${sheet.id}&return=1`)

  const { data: profile } = await supabase
    .from('profiles')
    .select('first_name, last_name')
    .eq('id', userId)
    .maybeSingle()
  const staffName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim() || null

  const templateData = {
    driverName,
    items,
    portalUrl,
    unitNumber: sheet.unit_number ?? (sheet as any).operator?.unit_number ?? null,
    senderName: staffName ? `${staffName}, SUPERTRANSPORT Operations` : undefined,
  }

  if (body.preview) {
    const entry = TEMPLATES['equipment-return-instructions']
    if (!entry) return fail(500, 'Email template not found')
    try {
      const html = await renderAsync(React.createElement(entry.component, templateData))
      const subject = typeof entry.subject === 'function' ? entry.subject(templateData) : entry.subject
      return ok({ success: true, preview: true, html, subject, recipient: email, items })
    } catch (err) {
      return fail(500, 'Could not render the email preview', err instanceof Error ? err.message : String(err))
    }
  }

  const result = await sendTemplateEmail({
    supabase,
    authHeader,
    templateName: 'equipment-return-instructions',
    recipientEmail: email,
    // Unique per attempt so resends are never deduped into no-ops.
    idempotencyKey: `equipment-return-${sheet.id}-${Date.now()}`,
    templateData,
  })
  if (!result.success) {
    return fail(502, 'Failed to send return instructions', result.details ?? result.error)
  }

  const { error: stampError } = await supabase
    .from('onboard_assignment_sheets')
    .update({
      return_requested_at: new Date().toISOString(),
      return_requested_by: userId,
      return_requested_by_name: staffName,
    })
    .eq('id', sheet.id)
  if (stampError) {
    console.error('Failed to stamp return_requested_at', stampError)
    return fail(500, 'Email sent but sheet could not be updated', stampError.message)
  }

  return ok({ success: true, sheetId: sheet.id, recipient: email })
}, 'send-equipment-return-instructions'))