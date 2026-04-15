import { supabase } from '@/integrations/supabase/client';

type DeviceType = 'eld' | 'dash_cam' | 'bestpass' | 'fuel_card';

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
  const serial = serialNumber?.trim() || null;

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
