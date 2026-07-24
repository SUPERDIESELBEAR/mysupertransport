import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

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

function isStaff(claims: Record<string, any>): boolean {
  const roles = claims.user_roles || claims.roles || []
  if (Array.isArray(roles)) {
    return roles.includes('management') || roles.includes('onboarding_staff') || roles.includes('owner') || roles.includes('admin')
  }
  return false
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Auth: staff only. The user JWT is passed via the Authorization header by the gateway.
  const authHeader = req.headers.get('Authorization') || ''
  if (!authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  const token = authHeader.replace('Bearer ', '')
  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  if (userError || !userData?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  const appMetadata = userData.user.app_metadata || {}
  if (!isStaff(appMetadata)) {
    // Also check user_roles table for staff roles
    const { data: roles } = await supabase.rpc('get_user_roles', { user_id: userData.user.id })
    const roleList = (roles ?? []) as string[]
    const isStaffRole = roleList.some(r => ['management', 'onboarding_staff', 'owner'].includes(r))
    if (!isStaffRole) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  try {
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
        return new Response(JSON.stringify({ error: 'Sheet not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      await sendSheetEmail(supabase, sheet, supabaseUrl)
      await supabase.from('onboard_assignment_sheets').update({ sent_at: new Date().toISOString() }).eq('id', payload.sheetId)
      return new Response(JSON.stringify({ success: true, sheetId: sheet.id }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const payload = body as CreatePayload
    if (!payload.operatorId) {
      return new Response(JSON.stringify({ error: 'operatorId is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    if (!payload.items || payload.items.length === 0) {
      return new Response(JSON.stringify({ error: 'At least one device must be assigned' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Validate items all belong to inventory and are available
    const equipmentIds = payload.items.map(i => i.equipmentId)
    const { data: inventoryRows, error: inventoryError } = await supabase
      .from('equipment_items')
      .select('id, device_type, serial_number, status')
      .in('id', equipmentIds)
    if (inventoryError) {
      return new Response(JSON.stringify({ error: 'Failed to verify inventory' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const inventoryMap = new Map(inventoryRows?.map(r => [r.id, r]))
    for (const item of payload.items) {
      const inv = inventoryMap.get(item.equipmentId)
      if (!inv) {
        return new Response(JSON.stringify({ error: `Equipment ${item.equipmentId} not found` }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      if (inv.status !== 'available') {
        return new Response(JSON.stringify({ error: `Serial ${inv.serial_number} is not available (${inv.status})` }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      if (inv.device_type !== item.deviceType) {
        return new Response(JSON.stringify({ error: `Device type mismatch for ${inv.serial_number}` }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
    }

    const { data: operator, error: operatorError } = await supabase
      .from('operators')
      .select('id, user_id, unit_number, applications(first_name, last_name, email, phone)')
      .eq('id', payload.operatorId)
      .single()
    if (operatorError || !operator) {
      return new Response(JSON.stringify({ error: 'Operator not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const app = (operator as any).applications
    const email = app?.email
    if (!email) {
      return new Response(JSON.stringify({ error: 'Operator has no email on file' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
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
        created_by: userData.user.id,
      })
      .select()
      .single()
    if (sheetError || !sheet) {
      console.error('Failed to create sheet', sheetError)
      return new Response(JSON.stringify({ error: 'Failed to create assignment sheet' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
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
      return new Response(JSON.stringify({ error: 'Failed to create sheet items' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
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
        assigned_by: userData.user.id,
      })
    }

    // Send email if requested
    if (body.sendToOperator) {
      const fullSheet = { ...sheet, items: sheetItems, operator }
      await sendSheetEmail(supabase, fullSheet as any, supabaseUrl)
    }

    return new Response(JSON.stringify({ success: true, sheetId: sheet.id }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err: any) {
    console.error('send-osas-to-operator error', err)
    return new Response(JSON.stringify({ error: err?.message || 'Internal error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})

async function sendSheetEmail(supabase: any, sheet: any, supabaseUrl: string) {
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

  const { error: sendError } = await supabase.functions.invoke('send-transactional-email', {
    body: {
      templateName: 'osas-sign-request',
      recipientEmail: email,
      idempotencyKey: `osas-${sheet.id}-${Date.now()}`,
      templateData: {
        operatorName,
        assignmentDate,
        unitNumber: sheet.unit_number,
        devices,
        bestpassIncluded: sheet.bestpass_included,
        signUrl,
      },
    },
  })
  if (sendError) {
    throw new Error(`Failed to send email: ${sendError.message || sendError}`)
  }
}
