import {
  requireStaff,
  ok,
  fail,
  withErrorEnvelope,
} from '../_shared/email/index.ts'

interface DeletePayload {
  sheetId: string
}

Deno.serve(withErrorEnvelope(async (req) => {
  const auth = await requireStaff(req, { roles: ['management', 'onboarding_staff', 'owner'] })
  if (auth instanceof Response) return auth
  const { supabase, userId, email } = auth

  let body: DeletePayload
  try {
    body = await req.json()
  } catch {
    return fail(400, 'Invalid JSON body')
  }
  if (!body?.sheetId) {
    return fail(400, 'sheetId is required')
  }

  // Load the sheet + its items so we know which equipment to release.
  const { data: sheet, error: sheetError } = await supabase
    .from('onboard_assignment_sheets')
    .select('id, operator_id, status, unit_number, sent_at, items:onboard_assignment_sheet_items(id, equipment_id)')
    .eq('id', body.sheetId)
    .single()
  if (sheetError || !sheet) {
    return fail(404, 'Sheet not found', sheetError?.message)
  }

  const items: Array<{ id: string; equipment_id: string | null }> = (sheet as any).items ?? []
  const equipmentIds = items.map(i => i.equipment_id).filter((v): v is string => !!v)

  const status = (sheet as any).status ?? 'draft'
  // A sheet that was ever sent to (or signed by) a driver is a permanent
  // record — it is voided, never deleted.
  const mustVoid = status !== 'draft' || !!(sheet as any).sent_at

  // 1) Release each piece of equipment back to inventory and remove its
  //    assignment record for this operator.
  for (const equipmentId of equipmentIds) {
    const { error: releaseError } = await supabase
      .from('equipment_items')
      .update({ status: 'available' })
      .eq('id', equipmentId)
    if (releaseError) {
      console.error('[delete-osas-sheet] failed to release equipment', equipmentId, releaseError)
    }
    const { error: assignError } = await supabase
      .from('equipment_assignments')
      .delete()
      .eq('equipment_id', equipmentId)
      .eq('operator_id', (sheet as any).operator_id)
    if (assignError) {
      console.error('[delete-osas-sheet] failed to delete assignment', equipmentId, assignError)
    }
  }

  if (mustVoid) {
    const { error: voidError } = await supabase
      .from('onboard_assignment_sheets')
      .update({ status: 'void', updated_at: new Date().toISOString() })
      .eq('id', body.sheetId)
    if (voidError) {
      return fail(500, 'Failed to void sheet', voidError.message)
    }
    await supabase.from('audit_log').insert({
      actor_id: userId,
      actor_name: email,
      action: 'osas_sheet_voided',
      entity_type: 'operator',
      entity_id: (sheet as any).operator_id,
      entity_label: `Assignment sheet • Unit ${(sheet as any).unit_number ?? '—'}`,
      metadata: { sheet_id: body.sheetId, previous_status: status, released_equipment: equipmentIds.length },
    })
    return ok({ success: true, sheetId: body.sheetId, voided: true, releasedEquipment: equipmentIds.length })
  }

  // 2) Delete the sheet's items.
  const { error: itemsDeleteError } = await supabase
    .from('onboard_assignment_sheet_items')
    .delete()
    .eq('sheet_id', body.sheetId)
  if (itemsDeleteError) {
    return fail(500, 'Failed to delete sheet items', itemsDeleteError.message)
  }

  // 3) Delete the sheet itself.
  const { error: sheetDeleteError } = await supabase
    .from('onboard_assignment_sheets')
    .delete()
    .eq('id', body.sheetId)
  if (sheetDeleteError) {
    return fail(500, 'Failed to delete sheet', sheetDeleteError.message)
  }

  await supabase.from('audit_log').insert({
    actor_id: userId,
    actor_name: email,
    action: 'osas_draft_deleted',
    entity_type: 'operator',
    entity_id: (sheet as any).operator_id,
    entity_label: `Draft assignment sheet • Unit ${(sheet as any).unit_number ?? '—'}`,
    metadata: { sheet_id: body.sheetId, released_equipment: equipmentIds.length },
  })

  return ok({ success: true, sheetId: body.sheetId, voided: false, releasedEquipment: equipmentIds.length })
}, 'delete-osas-sheet'))