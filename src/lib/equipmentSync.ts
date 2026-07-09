import { supabase } from '@/integrations/supabase/client';

type DeviceType = 'eld' | 'dash_cam' | 'bestpass' | 'fuel_card';

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
  const serial = serialNumber?.trim().replace(/[-.\s]/g, '').toUpperCase() || null;

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

    // Check if already assigned to this operator
    const { data: existingAssignment } = await supabase
      .from('equipment_assignments')
      .select('id')
      .eq('equipment_id', equipmentId)
      .eq('operator_id', operatorId)
      .is('returned_at', null)
      .maybeSingle();

    if (existingAssignment) return; // Already assigned — no-op

    // Block if assigned to a different active driver
    const { data: activeElsewhere } = await supabase
      .from('equipment_assignments')
      .select('operator_id')
      .eq('equipment_id', equipmentId)
      .is('returned_at', null)
      .limit(1);
    if (activeElsewhere && activeElsewhere.length > 0) {
      const holderId = (activeElsewhere[0] as any).operator_id as string;
      const holderName = await resolveOperatorName(holderId);
      throw new DuplicateAssignmentError({
        deviceType,
        serial,
        currentHolderName: holderName,
        reason: 'assigned_elsewhere',
      });
    }

    // Block lost / deactivated items
    if (existingDevice.status === 'lost' || existingDevice.status === 'deactivated') {
      throw new DuplicateAssignmentError({
        deviceType,
        serial,
        currentHolderName: null,
        reason: existingDevice.status as 'lost' | 'deactivated',
      });
    }

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
