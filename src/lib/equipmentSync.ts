import { supabase } from '@/integrations/supabase/client';

type DeviceType = 'eld' | 'dash_cam' | 'bestpass' | 'fuel_card';

/** Map from device type back to the onboarding_status column holding its serial. */
const DEVICE_TYPE_FIELD: Record<DeviceType, string> = {
  eld: 'eld_serial_number',
  dash_cam: 'dash_cam_number',
  bestpass: 'bestpass_number',
  fuel_card: 'fuel_card_number',
};

async function auditEquipment(
  action: 'equipment_archived' | 'equipment_restored' | 'equipment_deleted',
  item: { id: string; device_type: DeviceType; serial_number: string },
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const actorId = userData?.user?.id ?? null;
  let actorName: string | null = null;
  if (actorId) {
    const { data: prof } = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('user_id', actorId)
      .maybeSingle();
    if (prof) actorName = [prof.first_name, prof.last_name].filter(Boolean).join(' ').trim() || null;
  }
  await supabase.from('audit_log').insert({
    actor_id: actorId,
    actor_name: actorName,
    action,
    entity_type: 'equipment_item',
    entity_id: item.id,
    entity_label: `${item.device_type} • ${item.serial_number}`,
    metadata: { device_type: item.device_type, serial_number: item.serial_number, ...metadata },
  });
}

/**
 * Closes any open assignment, clears the serial from that driver's onboarding
 * record, and marks the device Archived. Shared by the fuel-card deactivate
 * modal and the Edit Device danger zone so both behave identically.
 */
export async function archiveEquipmentItem(
  item: { id: string; device_type: DeviceType; serial_number: string; current_assignment_id?: string | null },
  reason?: string | null,
): Promise<void> {
  await releaseOpenAssignments(item, 'deactivated', reason ?? null);

  const { error } = await supabase
    .from('equipment_items')
    .update({ status: 'deactivated' })
    .eq('id', item.id);
  if (error) throw error;

  await auditEquipment('equipment_archived', item, { reason: reason?.trim() || null });
}

/** Puts an archived device back into circulation as Available. */
export async function restoreEquipmentItem(
  item: { id: string; device_type: DeviceType; serial_number: string },
): Promise<void> {
  const { error } = await supabase
    .from('equipment_items')
    .update({ status: 'available' })
    .eq('id', item.id);
  if (error) throw error;
  await auditEquipment('equipment_restored', item);
}

export type DeleteEligibility =
  | { allowed: true; reason: 'no_history' | 'demo_only' }
  | { allowed: false; reason: 'real_history' };

/**
 * A device may only be permanently deleted when it was never assigned, or when
 * every driver that ever held it is a demo/test account. Anything else keeps
 * its history and must be archived instead.
 */
export async function getDeleteEligibility(equipmentId: string): Promise<DeleteEligibility> {
  const { data, error } = await supabase
    .from('equipment_assignments')
    .select('id, operators(is_demo)')
    .eq('equipment_id', equipmentId);
  if (error) throw error;

  const rows = (data ?? []) as any[];
  if (rows.length === 0) return { allowed: true, reason: 'no_history' };

  const allDemo = rows.every(r => {
    const op = Array.isArray(r.operators) ? r.operators[0] : r.operators;
    return op?.is_demo === true;
  });
  return allDemo ? { allowed: true, reason: 'demo_only' } : { allowed: false, reason: 'real_history' };
}

/** Permanently removes a device. Caller must have confirmed eligibility. */
export async function deleteEquipmentItem(
  item: { id: string; device_type: DeviceType; serial_number: string; current_assignment_id?: string | null },
): Promise<void> {
  // Clear the serial off any driver still holding it so onboarding doesn't
  // point at a device that no longer exists.
  await releaseOpenAssignments(item, null, null);

  const { error } = await supabase.from('equipment_items').delete().eq('id', item.id);
  if (error) throw error;

  await auditEquipment('equipment_deleted', item);
}

/** Closes open assignment rows for a device and nulls the driver's serial field. */
async function releaseOpenAssignments(
  item: { id: string; device_type: DeviceType },
  returnCondition: string | null,
  notes: string | null,
): Promise<void> {
  const { data: open, error: openErr } = await supabase
    .from('equipment_assignments')
    .select('id, operator_id')
    .eq('equipment_id', item.id)
    .is('returned_at', null);
  if (openErr) throw openErr;

  for (const row of (open ?? []) as any[]) {
    const { error: updErr } = await supabase
      .from('equipment_assignments')
      .update({
        returned_at: new Date().toISOString(),
        ...(returnCondition ? { return_condition: returnCondition } : {}),
        ...(notes ? { notes } : {}),
      })
      .eq('id', row.id);
    if (updErr) throw updErr;

    if (row.operator_id) {
      const field = DEVICE_TYPE_FIELD[item.device_type];
      const { error: clearErr } = await supabase
        .from('onboarding_status')
        .update({ [field]: null } as never)
        .eq('operator_id', row.operator_id);
      if (clearErr) throw clearErr;
    }
  }
}

/**
 * Canonical serial format used everywhere: uppercase, no dashes / spaces / dots.
 * Onboard Systems is the single source of truth for device numbers, so every
 * write and every comparison must run through this.
 */
export function normalizeSerial(value: string | null | undefined): string | null {
  const cleaned = (value ?? '').trim().replace(/[-.\s]/g, '').toUpperCase();
  return cleaned || null;
}

/** Dashes are not allowed in serials — surfaced inline on entry forms. */
export const SERIAL_DASH_MESSAGE = 'Serial numbers cannot contain dashes';

export function serialHasDash(value: string): boolean {
  return value.includes('-');
}

/**
 * Throws DuplicateAssignmentError when the item cannot be assigned to
 * `operatorId` — already open-assigned to someone else, lost, or deactivated.
 * Shared by the assign modal and the onboarding sync path so both enforce the
 * same rule with the same wording.
 */
export async function assertAssignable(opts: {
  equipmentId: string;
  deviceType: DeviceType;
  serial: string;
  status: string | null | undefined;
  operatorId: string;
}): Promise<'already_assigned' | 'ok'> {
  const { equipmentId, deviceType, serial, status, operatorId } = opts;

  const { data: open } = await supabase
    .from('equipment_assignments')
    .select('operator_id')
    .eq('equipment_id', equipmentId)
    .is('returned_at', null)
    .limit(1);

  if (open && open.length > 0) {
    const holderId = (open[0] as any).operator_id as string;
    if (holderId === operatorId) return 'already_assigned';
    throw new DuplicateAssignmentError({
      deviceType,
      serial,
      currentHolderName: await resolveOperatorName(holderId),
      reason: 'assigned_elsewhere',
    });
  }

  if (status === 'lost' || status === 'deactivated') {
    throw new DuplicateAssignmentError({
      deviceType,
      serial,
      currentHolderName: null,
      reason: status,
    });
  }

  return 'ok';
}

/**
 * Thrown when the requested serial+device is already actively assigned to
 * another driver, or the underlying inventory item is not in an assignable
 * state (lost / deactivated). Callers should catch this and surface a
 * user-friendly toast.
 */
export class DuplicateAssignmentError extends Error {
  deviceType: DeviceType;
  serial: string;
  currentHolderName: string | null;
  reason: 'assigned_elsewhere' | 'lost' | 'deactivated';
  constructor(opts: {
    deviceType: DeviceType;
    serial: string;
    currentHolderName: string | null;
    reason: 'assigned_elsewhere' | 'lost' | 'deactivated';
  }) {
    const label =
      opts.reason === 'assigned_elsewhere'
        ? `Serial ${opts.serial} is already assigned${opts.currentHolderName ? ` to ${opts.currentHolderName}` : ''}. Return or deactivate it from that driver before reassigning.`
        : opts.reason === 'lost'
          ? `Serial ${opts.serial} is marked LOST in inventory. Restore it to Available before assigning.`
          : `Serial ${opts.serial} is DEACTIVATED. Reactivate it in inventory before assigning.`;
    super(label);
    this.name = 'DuplicateAssignmentError';
    this.deviceType = opts.deviceType;
    this.serial = opts.serial;
    this.currentHolderName = opts.currentHolderName;
    this.reason = opts.reason;
  }
}

async function resolveOperatorName(operatorId: string): Promise<string | null> {
  const { data } = await supabase
    .from('operators')
    .select('applications(first_name, last_name)')
    .eq('id', operatorId)
    .maybeSingle();
  const app = (data as any)?.applications;
  const name = [app?.first_name, app?.last_name].filter(Boolean).join(' ');
  return name || null;
}

/**
 * Syncs a device serial number from onboarding_status to the Equipment Inventory.
 *
 * - If serialNumber is provided and a matching device exists → assigns it (if not already)
 * - If serialNumber is provided but no device exists → creates device + assignment
 * - If serialNumber is empty/null → returns any previously assigned device of this type
 */
export async function syncDeviceToInventory(
  operatorId: string,
  deviceType: DeviceType,
  serialNumber: string | null | undefined,
  assignedBy: string | null,
): Promise<void> {
  const serial = normalizeSerial(serialNumber);

  if (!serial) {
    // Return any active assignment for this operator + device type
    const { data: activeAssignments } = await supabase
      .from('equipment_assignments')
      .select('id, equipment_id, equipment_items!inner(device_type)')
      .eq('operator_id', operatorId)
      .is('returned_at', null)
      .eq('equipment_items.device_type', deviceType);

    if (activeAssignments && activeAssignments.length > 0) {
      for (const a of activeAssignments) {
        await supabase
          .from('equipment_assignments')
          .update({ returned_at: new Date().toISOString() })
          .eq('id', a.id);
        await supabase
          .from('equipment_items')
          .update({ status: 'available' })
          .eq('id', a.equipment_id);
      }
    }
    return;
  }

  // Check if device already exists
  const { data: existingDevice } = await supabase
    .from('equipment_items')
    .select('id, status')
    .eq('serial_number', serial)
    .eq('device_type', deviceType)
    .maybeSingle();

  let equipmentId: string;

  if (existingDevice) {
    equipmentId = existingDevice.id;

    const outcome = await assertAssignable({
      equipmentId,
      deviceType,
      serial,
      status: existingDevice.status,
      operatorId,
    });
    if (outcome === 'already_assigned') return; // no-op

    // Set device to assigned
    await supabase
      .from('equipment_items')
      .update({ status: 'assigned' })
      .eq('id', equipmentId);
  } else {
    // Create new device
    const { data: newDevice, error } = await supabase
      .from('equipment_items')
      .insert({
        serial_number: serial,
        device_type: deviceType,
        status: 'assigned',
      })
      .select('id')
      .single();

    if (error || !newDevice) {
      console.error('[equipmentSync] Failed to create device:', error?.message);
      return;
    }
    equipmentId = newDevice.id;
  }

  // Create assignment
  await supabase.from('equipment_assignments').insert({
    equipment_id: equipmentId,
    operator_id: operatorId,
    assigned_by: assignedBy,
  });
}

/** Map from onboarding_status field names to device types */
export const DEVICE_FIELD_MAP: Record<string, DeviceType> = {
  eld_serial_number: 'eld',
  dash_cam_number: 'dash_cam',
  bestpass_number: 'bestpass',
  fuel_card_number: 'fuel_card',
};

/**
 * Syncs all 4 device fields, comparing old vs new values.
 * Only triggers sync for fields that actually changed.
 */
export async function syncAllDeviceFields(
  operatorId: string,
  oldValues: Record<string, string | null>,
  newValues: Record<string, string | null>,
  assignedBy: string | null,
): Promise<void> {
  const promises: Promise<void>[] = [];

  for (const [field, deviceType] of Object.entries(DEVICE_FIELD_MAP)) {
    const oldVal = oldValues[field]?.trim() || null;
    const newVal = newValues[field]?.trim() || null;
    if (oldVal !== newVal) {
      promises.push(syncDeviceToInventory(operatorId, deviceType, newVal, assignedBy));
    }
  }

  await Promise.all(promises);
}
