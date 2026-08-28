import { supabase } from '@/integrations/supabase/client';

export type DeviceType = 'eld' | 'dash_cam' | 'bestpass' | 'fuel_card';

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

/**
 * Comparison form of a serial. On top of normalizeSerial it folds the
 * characters that are visually confusable on a device label — O/0, I/1, L/1,
 * S/5 — so `AABL36UGO24945` and `AABL36UG024945` are recognised as the same
 * physical device. Vendor serials here are a letter prefix followed by digits,
 * so folding can never collapse two genuinely different devices.
 *
 * Only comparisons use this. The serial is always STORED as typed.
 */
export function canonicalSerial(value: string | null | undefined): string | null {
  const normalized = normalizeSerial(value);
  if (!normalized) return null;
  return normalized.replace(/[OILS]/g, ch =>
    ch === 'O' ? '0' : ch === 'S' ? '5' : '1',
  );
}

/** True when two serials are the same device once confusables are folded. */
export function serialsCollide(a: string | null | undefined, b: string | null | undefined): boolean {
  const ca = canonicalSerial(a);
  const cb = canonicalSerial(b);
  return !!ca && !!cb && ca === cb;
}

/**
 * Indexes (into the NORMALIZED form) where two serials differ. Canonical
 * collisions are the same length in practice; when they are not, the trailing
 * overflow of the longer string is reported so callers never have to guard.
 */
export function serialDiffPositions(
  a: string | null | undefined,
  b: string | null | undefined,
): number[] {
  const na = normalizeSerial(a) ?? '';
  const nb = normalizeSerial(b) ?? '';
  const out: number[] = [];
  const len = Math.max(na.length, nb.length);
  for (let i = 0; i < len; i++) {
    if (na[i] !== nb[i]) out.push(i);
  }
  return out;
}

/** Plain-language sentence naming the differing characters, or null if identical. */
export function describeSerialDiff(
  a: string | null | undefined,
  b: string | null | undefined,
): string | null {
  const na = normalizeSerial(a) ?? '';
  const nb = normalizeSerial(b) ?? '';
  const positions = serialDiffPositions(na, nb);
  if (positions.length === 0) return null;
  if (positions.length > 3) {
    return `Differs at ${positions.length} characters.`;
  }
  const parts = positions.map(i => `position ${i + 1}: ${na[i] ?? '—'} vs ${nb[i] ?? '—'}`);
  const joined = parts.length === 1
    ? parts[0]
    : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `Differs at ${joined} — these look alike.`;
}

/** Levenshtein distance capped at 2 — enough to answer "is this one edit away?". */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 3;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

export interface SerialMatch {
  id: string;
  serial_number: string;
  status: string;
  holderName: string | null;
  /** 'collision' = same device after folding (hard block); 'near' = one edit away. */
  kind: 'collision' | 'near';
}

/**
 * Looks for existing devices of the same type whose serial either collides
 * after confusable folding, or sits exactly one character away (the classic
 * dropped/added-digit typo). Used by the add and assign forms.
 */
export async function findSerialMatches(
  deviceType: DeviceType,
  serial: string | null | undefined,
  excludeId?: string | null,
): Promise<SerialMatch[]> {
  const canon = canonicalSerial(serial);
  if (!canon) return [];

  const { data } = await supabase
    .from('equipment_items')
    .select('id, serial_number, status')
    .eq('device_type', deviceType);

  const candidates = ((data ?? []) as any[])
    .filter(row => row.id !== excludeId)
    .map(row => {
      const rowCanon = canonicalSerial(row.serial_number) ?? '';
      const kind: 'collision' | 'near' | null =
        rowCanon === canon ? 'collision'
          : editDistance(rowCanon, canon) === 1 ? 'near'
            : null;
      return kind ? { id: row.id as string, serial_number: row.serial_number as string, status: row.status as string, kind } : null;
    })
    .filter(Boolean) as Omit<SerialMatch, 'holderName'>[];

  if (candidates.length === 0) return [];

  const { data: open } = await supabase
    .from('equipment_assignments')
    .select('equipment_id, operator_id')
    .in('equipment_id', candidates.map(c => c.id))
    .is('returned_at', null);

  const holderByEquipment = new Map<string, string | null>();
  for (const row of (open ?? []) as any[]) {
    holderByEquipment.set(row.equipment_id, await resolveOperatorName(row.operator_id));
  }

  return candidates
    .map(c => ({ ...c, holderName: holderByEquipment.get(c.id) ?? null }))
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'collision' ? -1 : 1));
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

  // Check if device already exists — matched on the canonical (confusable-folded)
  // form so an O-for-zero typo reuses the existing device instead of cloning it.
  const { data: sameTypeItems } = await supabase
    .from('equipment_items')
    .select('id, status, serial_number')
    .eq('device_type', deviceType);
  const canon = canonicalSerial(serial);
  const existingDevice = ((sameTypeItems ?? []) as any[])
    .find(row => canonicalSerial(row.serial_number) === canon) ?? null;


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

/**
 * Resolves a serial conflict: two inventory records that are really one
 * physical device. The surviving record keeps its open assignment (so the
 * driver holding the device does not change); the duplicate's history is
 * repointed onto the survivor, its open assignment is closed, and the driver
 * that held the duplicate has the serial cleared from their onboarding record.
 *
 * `correctedSerial` covers the case where the right driver has the wrong
 * number typed on their record: the survivor's serial is rewritten (and pushed
 * to its holder's onboarding field) before the duplicate row is deleted, so the
 * confusable-serial guard never sees two rows on the corrected value.
 */
export async function mergeEquipmentItems(
  survivor: { id: string; device_type: DeviceType; serial_number: string },
  loser: { id: string; device_type: DeviceType; serial_number: string },
  opts: { correctedSerial?: string | null } = {},
): Promise<void> {
  if (survivor.id === loser.id) return;

  const field = DEVICE_TYPE_FIELD[loser.device_type];

  const corrected = normalizeSerial(opts.correctedSerial);
  const survivorSerial = normalizeSerial(survivor.serial_number);
  const needsCorrection = !!corrected && corrected !== survivorSerial;

  // Close any open assignment on the duplicate and clear that driver's field.
  const { data: open, error: openErr } = await supabase
    .from('equipment_assignments')
    .select('id, operator_id')
    .eq('equipment_id', loser.id)
    .is('returned_at', null);
  if (openErr) throw openErr;

  for (const row of (open ?? []) as any[]) {
    const { error: updErr } = await supabase
      .from('equipment_assignments')
      .update({
        returned_at: new Date().toISOString(),
        notes: `Merged into ${corrected ?? survivor.serial_number} — duplicate record`,
      })
      .eq('id', row.id);
    if (updErr) throw updErr;

    if (row.operator_id) {
      const { error: clearErr } = await supabase
        .from('onboarding_status')
        .update({ [field]: null } as never)
        .eq('operator_id', row.operator_id);
      if (clearErr) throw clearErr;
    }
  }

  // Repoint remaining (closed) history onto the survivor.
  const { error: moveErr } = await supabase
    .from('equipment_assignments')
    .update({ equipment_id: survivor.id })
    .eq('equipment_id', loser.id)
    .not('returned_at', 'is', null);
  if (moveErr) throw moveErr;

  const { error: delErr } = await supabase.from('equipment_items').delete().eq('id', loser.id);
  if (delErr) throw delErr;

  if (needsCorrection) {
    const { error: fixErr } = await supabase
      .from('equipment_items')
      .update({ serial_number: corrected })
      .eq('id', survivor.id);
    if (fixErr) throw fixErr;

    // Push the corrected number onto the holding driver's onboarding record.
    const { data: stillOpen, error: holderErr } = await supabase
      .from('equipment_assignments')
      .select('operator_id')
      .eq('equipment_id', survivor.id)
      .is('returned_at', null);
    if (holderErr) throw holderErr;

    for (const row of (stillOpen ?? []) as any[]) {
      if (!row.operator_id) continue;
      const { error: setErr } = await supabase
        .from('onboarding_status')
        .update({ [field]: corrected } as never)
        .eq('operator_id', row.operator_id);
      if (setErr) throw setErr;
    }
  }

  await auditEquipment('equipment_deleted', loser, {
    merged_into_id: survivor.id,
    merged_into_serial: corrected ?? survivor.serial_number,
    ...(needsCorrection
      ? { serial_corrected_from: survivor.serial_number, serial_corrected_to: corrected }
      : {}),
    reason: 'serial_conflict_merge',
  });
}


