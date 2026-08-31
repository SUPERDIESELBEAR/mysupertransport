import type { LoadDocumentType } from '@/lib/loadDocuments';

/**
 * Guided loadout capture slots — THE single source of truth.
 *
 * The paperwork predicate (src/lib/loadPaperwork.ts) and the driver capture UI
 * both read this module. A second list anywhere is how the two drift, and the
 * drift is what let a driver type "doors open" and never clear the load.
 *
 * Free text is gone. Nothing here is matched fuzzily: `photoLabel` is stored
 * verbatim in load_documents.photo_label and compared exactly (trimmed,
 * case-folded) by the predicate.
 */

export type LoadoutStage = 'pickup' | 'delivery';

/** photo = ordinary capture, sticker = tri-state answer, damage = repeatable note. */
export type LoadoutSlotKind = 'photo' | 'sticker' | 'damage';

export interface LoadoutSlot {
  /** Stable identifier, safe for test ids and React keys. */
  key: string;
  /** Written verbatim to load_documents.photo_label. Never edited by the driver. */
  photoLabel: string;
  /** Shown as the slot heading. */
  title: string;
  /**
   * One line shown with the camera. This is the real value of fixed slots — a
   * label cannot teach, and a new driver has never done a loadout.
   */
  instruction: string;
  required: boolean;
  kind: LoadoutSlotKind;
  repeatable?: boolean;
}

export const LOADOUT_STAGE_DOCUMENT_TYPE: Record<LoadoutStage, LoadDocumentType> = {
  pickup: 'loadout_pickup_inspection',
  delivery: 'loadout_delivery_inspection',
};

export const LOADOUT_STAGE_LABEL: Record<LoadoutStage, string> = {
  pickup: 'Pickup inspection',
  delivery: 'Delivery inspection',
};

const PICKUP_SLOTS: LoadoutSlot[] = [
  {
    key: 'pickup_front', photoLabel: 'Front', title: 'Front', kind: 'photo', required: true,
    instruction: 'Stand square to the nose of the trailer with the whole front in frame.',
  },
  {
    key: 'pickup_driver_side', photoLabel: 'Driver Side', title: 'Driver Side', kind: 'photo', required: true,
    instruction: 'Step back far enough to get the full length of the driver side.',
  },
  {
    key: 'pickup_passenger_side', photoLabel: 'Passenger Side', title: 'Passenger Side', kind: 'photo', required: true,
    instruction: 'Same again on the passenger side, full length in one shot.',
  },
  {
    key: 'pickup_rear_closed', photoLabel: 'Rear Doors Closed', title: 'Rear Doors Closed', kind: 'photo', required: true,
    instruction: 'Both doors shut, with any seal or lock readable in the shot.',
  },
  {
    // The stored label stays 'Rear Doors Open' so the existing predicate keeps
    // matching and no backfill is needed. The SLOT is what changed.
    key: 'pickup_roof_check', photoLabel: 'Rear Doors Open', title: 'Roof check — doors open',
    kind: 'photo', required: true,
    instruction:
      'Stand at the back with the doors open and shoot up toward the nose. Any daylight through the ceiling is a hole — note it as damage.',
  },
  {
    key: 'pickup_number_plate', photoLabel: 'Trailer Number Plate', title: 'Trailer Number Plate', kind: 'photo', required: true,
    instruction: 'Close enough that the trailer number reads clearly.',
  },
  {
    key: 'pickup_vin_plate', photoLabel: 'VIN Plate', title: 'VIN Plate', kind: 'photo', required: true,
    instruction:
      "The manufacturer's data plate, usually inside the door jamb or on the front left frame rail. Close enough to read the VIN.",
  },
  {
    key: 'pickup_tires', photoLabel: 'Tires and Wheels', title: 'Tires and Wheels', kind: 'photo', required: true,
    instruction: 'Tread and sidewalls on the tandem, plus any missing lug caps.',
  },
  {
    key: 'pickup_sticker', photoLabel: 'Annual Inspection Sticker', title: 'Annual Inspection Sticker',
    kind: 'sticker', required: true,
    instruction: 'Usually on the driver side near the front. Answer even if you cannot find it.',
  },
  {
    key: 'pickup_landing_gear', photoLabel: 'Landing Gear', title: 'Landing Gear', kind: 'photo', required: false,
    instruction: 'Legs, crank handle and foot pads.',
  },
  {
    key: 'pickup_underride', photoLabel: 'Rear Underride Guard', title: 'Rear Underride Guard', kind: 'photo', required: false,
    instruction: 'The bar under the rear doors — bent or cracked mounts matter.',
  },
  {
    key: 'pickup_interior_floor', photoLabel: 'Interior Floor', title: 'Interior Floor', kind: 'photo', required: false,
    instruction: 'From the rear doorway, shoot down the floor. Do not climb up.',
  },
  {
    key: 'pickup_damage', photoLabel: 'Damage', title: 'Damage', kind: 'damage', required: false, repeatable: true,
    instruction: 'Photograph anything already wrong and describe it. Add one per problem.',
  },
];

const DELIVERY_SLOTS: LoadoutSlot[] = [
  {
    key: 'delivery_front', photoLabel: 'Front', title: 'Front', kind: 'photo', required: true,
    instruction: 'Square to the nose, whole front in frame.',
  },
  {
    key: 'delivery_driver_side', photoLabel: 'Driver Side', title: 'Driver Side', kind: 'photo', required: true,
    instruction: 'Full length of the driver side.',
  },
  {
    key: 'delivery_passenger_side', photoLabel: 'Passenger Side', title: 'Passenger Side', kind: 'photo', required: true,
    instruction: 'Full length of the passenger side.',
  },
  {
    key: 'delivery_rear_closed', photoLabel: 'Rear Doors Closed', title: 'Rear Doors Closed', kind: 'photo', required: true,
    instruction: 'Both doors shut as you left them.',
  },
  {
    key: 'delivery_number_plate', photoLabel: 'Trailer Number Plate', title: 'Trailer Number Plate', kind: 'photo', required: true,
    instruction: 'Close enough that the trailer number reads clearly.',
  },
  {
    key: 'delivery_vin_plate', photoLabel: 'VIN Plate', title: 'VIN Plate', kind: 'photo', required: true,
    instruction: 'The same data plate you photographed at pickup.',
  },
  {
    key: 'delivery_tires', photoLabel: 'Tires and Wheels', title: 'Tires and Wheels', kind: 'photo', required: true,
    instruction:
      'Tread and sidewalls on the tandem again — this is what shows you did not flat-spot it.',
  },
  {
    key: 'delivery_signage', photoLabel: 'Delivery Location Signage', title: 'Delivery Location Signage', kind: 'photo', required: true,
    instruction: 'A sign, gate or building name that proves where you dropped it.',
  },
  {
    key: 'delivery_interior_floor', photoLabel: 'Interior Floor', title: 'Interior Floor', kind: 'photo', required: false,
    instruction: 'From the rear doorway only. Do not climb up.',
  },
  {
    key: 'delivery_damage', photoLabel: 'Damage', title: 'Damage', kind: 'damage', required: false, repeatable: true,
    instruction: 'Anything that changed in transit. Photo plus a description.',
  },
];

export const LOADOUT_SLOTS: Record<LoadoutStage, LoadoutSlot[]> = {
  pickup: PICKUP_SLOTS,
  delivery: DELIVERY_SLOTS,
};

export const LOADOUT_STAGES: LoadoutStage[] = ['pickup', 'delivery'];

/** Slots that hold the load short of paperwork-complete when absent. */
export function requiredLoadoutSlots(stage: LoadoutStage): LoadoutSlot[] {
  return LOADOUT_SLOTS[stage].filter(s => s.required && s.kind !== 'damage');
}

export function optionalLoadoutSlots(stage: LoadoutStage): LoadoutSlot[] {
  return LOADOUT_SLOTS[stage].filter(s => !s.required || s.kind === 'damage');
}
