import {
  requireStaff,
  ok,
  fail,
  withErrorEnvelope,
  sendTemplateEmail,
} from '../_shared/email/index.ts'

// Supabase-managed edge function for creating / sending Onboard Systems Assignment Sheets.

const DEVICE_TYPES = ['eld', 'dash_cam', 'bestpass'] as const

type OsasDeviceType = typeof DEVICE_TYPES[number]

interface DeviceInput {
  deviceType: OsasDeviceType
  equipmentId: string
  serial: string
}

interface CreatePayload {
  operatorId: string
  unitNumber?: string | null
  assignmentDate?: string | null
  bestpassIncluded?: boolean
  bestpassFeeCents?: number | null
  items: DeviceInput[]
  sendToOperator?: boolean
}

interface ResendPayload {
  sheetId: string
  sendToOperator?: boolean
}

function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

Deno.serve(withErrorEnvelope(async (req) => {
  // Single, correct staff auth check.
  const auth = await requireStaff(req, { roles: ['management', 'onboarding_staff', 'owner'] })
  if (auth instanceof Response) return auth
  const { supabase, authHeader, userId } = auth
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!

  let body: any
  try {
    body = await req.json()
  } catch {
    return fail(400, 'Invalid JSON body')
  }

    if (body.sheetId) {
      const payload = body as ResendPayload
      const { data: sheet, error: sheetError } = await supabase
        .from('onboard_assignment_sheets')
        .select(`
          *,
          items:onboard_assignment_sheet_items(*),
          operator:operator_id(
            *,
            applications(first_name, last_name, email, phone)
          )
        `)
        .eq('id', payload.sheetId)
        .single()
      if (sheetError || !sheet) {
        return fail(404, 'Sheet not found', sheetError?.message)
      }
      await sendSheetEmail(supabase, authHeader, sheet, supabaseUrl)
      await supabase.from('onboard_assignment_sheets').update({ sent_at: new Date().toISOString() }).eq('id', payload.sheetId)
      return ok({ success: true, sheetId: sheet.id })
    }

    const payload = body as CreatePayload
    if (!payload.operatorId) {
      return fail(400, 'operatorId is required')
    }
    if (!payload.items || payload.items.length === 0) {
      return fail(400, 'At least one device must be assigned')
    }

    // Validate items all belong to inventory and are available
    const equipmentIds = payload.items.map(i => i.equipmentId)
    const { data: inventoryRows, error: inventoryError } = await supabase
      .from('equipment_items')
      .select('id, device_type, serial_number, status')
      .in('id', equipmentIds)
    if (inventoryError) {
      return fail(500, 'Failed to verify inventory', inventoryError.message)
    }
    const inventoryMap = new Map(inventoryRows?.map(r => [r.id, r]))
    for (const item of payload.items) {
      const inv = inventoryMap.get(item.equipmentId)
      if (!inv) {
        return fail(400, `Equipment ${item.equipmentId} not found`)
      }
      if (inv.status !== 'available') {
        return fail(409, `Serial ${inv.serial_number} is not available (${inv.status})`)
      }
      if (inv.device_type !== item.deviceType) {
        return fail(400, `Device type mismatch for ${inv.serial_number}`)
      }
    }

    const { data: operator, error: operatorError } = await supabase
      .from('operators')
      .select('id, user_id, unit_number, applications(first_name, last_name, email, phone)')
      .eq('id', payload.operatorId)
      .single()
    if (operatorError || !operator) {
      return fail(404, 'Operator not found', operatorError?.message)
    }
    const app = (operator as any).applications
    const email = app?.email
    if (!email) {
      return fail(400, 'Operator has no email on file')
    }

    const accessToken = generateToken()
    const assignmentDate = payload.assignmentDate || new Date().toISOString().split('T')[0]
    const bestpassIncluded = !!payload.bestpassIncluded
    const bestpassFeeCents = bestpassIncluded ? (payload.bestpassFeeCents ?? 6000) : null
    const status = body.sendToOperator ? 'sent' : 'draft'
    const sentAt = body.sendToOperator ? new Date().toISOString() : null

    const { data: sheet, error: sheetError } = await supabase
      .from('onboard_assignment_sheets')
      .insert({
        operator_id: payload.operatorId,
        access_token: accessToken,
        status,
        assignment_date: assignmentDate,
        unit_number: payload.unitNumber || operator.unit_number || null,
        bestpass_included: bestpassIncluded,
        bestpass_fee_cents: bestpassFeeCents,
        sent_at: sentAt,
        created_by: userId,
      })
      .select()
      .single()
    if (sheetError || !sheet) {
      console.error('Failed to create sheet', sheetError)
      return fail(500, 'Failed to create assignment sheet', sheetError?.message)
    }

    const sheetItems = payload.items.map(item => ({
      sheet_id: sheet.id,
      device_type: item.deviceType,
      equipment_id: item.equipmentId,
      serial_snapshot: item.serial || inventoryMap.get(item.equipmentId)?.serial_number || '',
    }))
    const { error: itemsError } = await supabase.from('onboard_assignment_sheet_items').insert(sheetItems)
    if (itemsError) {
      console.error('Failed to insert sheet items', itemsError)
      await supabase.from('onboard_assignment_sheets').delete().eq('id', sheet.id)
      return fail(500, 'Failed to create sheet items', itemsError.message)
    }

    // Mark equipment as assigned and create assignment records
    const now = new Date().toISOString()
    for (const item of payload.items) {
      const { error: updateErr } = await supabase.from('equipment_items').update({ status: 'assigned' }).eq('id', item.equipmentId)
      if (updateErr) {
        console.error('Failed to update equipment status', updateErr)
      }
      await supabase.from('equipment_assignments').insert({
        equipment_id: item.equipmentId,
        operator_id: payload.operatorId,
        assigned_at: now,
        assigned_by: userId,
      })
    }

    // Send email if requested
    if (body.sendToOperator) {
      const fullSheet = { ...sheet, items: sheetItems, operator }
      await sendSheetEmail(supabase, authHeader, fullSheet as any, supabaseUrl)
    }

    return ok({ success: true, sheetId: sheet.id })
}, 'send-osas-to-operator'))

async function sendSheetEmail(supabase: any, authHeader: string, sheet: any, supabaseUrl: string) {
  const app = sheet.operator?.applications
  const email = app?.email
  if (!email) {
    throw new Error('Operator has no email')
  }
  const operatorName = [app?.first_name, app?.last_name].filter(Boolean).join(' ').trim()
  const assignmentDate = sheet.assignment_date
    ? new Date(sheet.assignment_date + 'T12:00:00').toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
    : ''

  const devices = (sheet.items || []).map((it: any) => ({
    type: it.device_type,
    serial: it.serial_snapshot,
  }))

  const signUrl = `${supabaseUrl.replace('/supabase', '')}/operator/onboard-systems?osas_token=${sheet.access_token}`

  const result = await sendTemplateEmail({
    supabase,
    authHeader,
    templateName: 'osas-sign-request',
    recipientEmail: email,
    // Stable per-sheet key; retries within the same sheet won't duplicate.
    idempotencyKey: `osas-${sheet.id}`,
    templateData: {
      operatorName,
      assignmentDate,
      unitNumber: sheet.unit_number,
      devices,
      bestpassIncluded: sheet.bestpass_included,
      signUrl,
    },
  })
  if (!result.success) {
    throw new Error(`Failed to send OSAS email: ${result.error ?? 'unknown'} ${typeof result.details === 'string' ? '- ' + result.details : ''}`)
  }
}
