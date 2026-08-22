/**
 * Reference label classification.
 *
 * Brokers print the same identifier under several labels, and print the same
 * label several ways: Stop 1's comment line says `PU#` while the References
 * table two pages later says `Pickup Number`. Both are the pickup number and
 * must land in the same class, or the diff invents a change that is not on the
 * page.
 *
 * Two kinds of row show up in a broker's References table:
 *   - IDENTIFYING  — a number that names this shipment (BOL, PRO, PU#, PO#).
 *     These are stored as reference rows and are what AP and tracing desks look
 *     up.
 *   - CATEGORICAL  — an attribute wearing a reference label. `Mode: TL` is the
 *     example. It is not an identifier: every truckload tender in the system
 *     carries the same value, so storing it as a reference would bloat the
 *     index and make duplicate detection fire on unrelated loads. Categorical
 *     labels are recognised here and routed OUT of references — `mode` goes to
 *     `loads.mode`; anything else categorical is dropped with a log line.
 */

export type ReferenceClass =
  | 'bol'
  | 'pro'
  | 'pickup'
  | 'po'
  | 'delivery'
  | 'order'
  | 'shipment'
  | 'appointment'
  | 'seal'
  | 'trailer'
  | 'mode'
  | 'equipment'
  | 'service'
  | 'other';

export interface ReferenceClassSpec {
  clazz: ReferenceClass;
  label: string;
  /** Names a shipment: stored as a reference row, eligible for duplicate checks. */
  identifying: boolean;
  /** Where a non-identifying class is routed instead of `load_references`. */
  routeTo?: 'loads.mode';
}

export const REFERENCE_CLASSES: Record<ReferenceClass, ReferenceClassSpec> = {
  bol:         { clazz: 'bol',         label: 'BOL',              identifying: true },
  pro:         { clazz: 'pro',         label: 'PRO',              identifying: true },
  pickup:      { clazz: 'pickup',      label: 'Pickup Number',    identifying: true },
  po:          { clazz: 'po',          label: 'PO Number',        identifying: true },
  delivery:    { clazz: 'delivery',    label: 'Delivery Number',  identifying: true },
  order:       { clazz: 'order',       label: 'Order Number',     identifying: true },
  shipment:    { clazz: 'shipment',    label: 'Shipment Number',  identifying: true },
  appointment: { clazz: 'appointment', label: 'Appointment',      identifying: true },
  seal:        { clazz: 'seal',        label: 'Seal Number',      identifying: true },
  trailer:     { clazz: 'trailer',     label: 'Trailer Number',   identifying: true },
  mode:        { clazz: 'mode',        label: 'Mode',             identifying: false, routeTo: 'loads.mode' },
  equipment:   { clazz: 'equipment',   label: 'Equipment',        identifying: false },
  service:     { clazz: 'service',     label: 'Service Level',    identifying: false },
  other:       { clazz: 'other',       label: 'Reference',        identifying: true },
};

/** Printed label -> class. Keys are normalized by `labelKey`. */
const LABEL_MAP: Record<string, ReferenceClass> = {
  BOL: 'bol', BOLNUMBER: 'bol', BILLOFLADING: 'bol', BILLOFLADINGNUMBER: 'bol', BL: 'bol',
  PRO: 'pro', PRONUMBER: 'pro', PROBILL: 'pro', PROBILLNUMBER: 'pro',
  PU: 'pickup', PUNUMBER: 'pickup', PICKUP: 'pickup', PICKUPNUMBER: 'pickup',
  PICKUPREFERENCE: 'pickup', SHIPPERREFERENCE: 'pickup', SHIPPERNUMBER: 'pickup',
  PO: 'po', PONUMBER: 'po', PURCHASEORDER: 'po', PURCHASEORDERNUMBER: 'po', CUSTOMERPO: 'po',
  DEL: 'delivery', DELNUMBER: 'delivery', DELIVERY: 'delivery', DELIVERYNUMBER: 'delivery',
  DELIVERYREFERENCE: 'delivery', CONSIGNEEREFERENCE: 'delivery',
  ORDER: 'order', ORDERNUMBER: 'order', SALESORDER: 'order', SO: 'order',
  SHIPMENT: 'shipment', SHIPMENTNUMBER: 'shipment', SHIPMENTID: 'shipment', LOAD: 'shipment',
  LOADNUMBER: 'shipment', TRIP: 'shipment', TRIPNUMBER: 'shipment',
  APPOINTMENT: 'appointment', APPOINTMENTNUMBER: 'appointment', APPT: 'appointment', APPTNUMBER: 'appointment',
  SEAL: 'seal', SEALNUMBER: 'seal',
  TRAILER: 'trailer', TRAILERNUMBER: 'trailer',
  MODE: 'mode', TRANSPORTATIONMODE: 'mode',
  EQUIPMENT: 'equipment', EQUIPMENTTYPE: 'equipment',
  SERVICE: 'service', SERVICELEVEL: 'service',
};

/** `Pickup Number` / `PU#` / `pu number:` all reduce to the same key. */
export function labelKey(label: string | null | undefined): string {
  return (label ?? '').toUpperCase().replace(/[^A-Z]/g, '');
}

export function classifyReferenceLabel(label: string | null | undefined): ReferenceClass {
  const key = labelKey(label);
  if (!key) return 'other';
  if (LABEL_MAP[key]) return LABEL_MAP[key];
  // `PU# (Shipper)` style suffixes: fall back to a prefix hit.
  const hit = Object.keys(LABEL_MAP).find((k) => k.length >= 3 && key.startsWith(k));
  return hit ? LABEL_MAP[hit] : 'other';
}

export const isIdentifyingClass = (c: ReferenceClass): boolean =>
  REFERENCE_CLASSES[c].identifying;

/** Comparison key for a value: case and punctuation insensitive, content preserved. */
export const referenceValueKey = (value: string | null | undefined): string =>
  (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export interface ParsedReferenceRow {
  label: string | null;
  value: string | null;
  /** Stop sequence this row was printed against; null for a load-level row. */
  stopSequence?: number | null;
}

export interface ClassifiedReference {
  clazz: ReferenceClass;
  /** The label as printed, kept for display. */
  label: string;
  value: string;
  valueKey: string;
  /** Stop sequences where this reference is printed. */
  citations: number[];
  /** True when the row is printed in the load-level References table. */
  loadLevel: boolean;
}

export interface ClassifyResult {
  references: ClassifiedReference[];
  /** Categorical rows routed out of references. */
  routed: { clazz: ReferenceClass; value: string; routeTo?: string }[];
  dropped: { clazz: ReferenceClass; label: string; value: string }[];
}

/** Identity of a reference row for diffing and dedup: class + normalized value. */
export const referenceKey = (clazz: ReferenceClass, value: string | null | undefined): string =>
  `${clazz}:${referenceValueKey(value)}`;

/**
 * Collapse a document's reference rows into one row per (class, value), keeping
 * a citation for every stop the value was printed against.
 *
 * Deduping on value alone is wrong: a broker that prints one number as BOL, PRO
 * and load number is describing three lookups their desks perform separately.
 * Deduping on class+value is also what stops the second pass from dropping a
 * shipment number that legitimately appears on several stops — the repeat is
 * recorded as an extra citation, not discarded.
 */
export function classifyReferences(rows: ParsedReferenceRow[]): ClassifyResult {
  const byKey = new Map<string, ClassifiedReference>();
  const routed: ClassifyResult['routed'] = [];
  const dropped: ClassifyResult['dropped'] = [];

  rows.forEach((row) => {
    const value = (row.value ?? '').trim();
    if (!value) return;
    const clazz = classifyReferenceLabel(row.label);
    const spec = REFERENCE_CLASSES[clazz];

    if (!spec.identifying) {
      if (spec.routeTo) routed.push({ clazz, value, routeTo: spec.routeTo });
      else dropped.push({ clazz, label: (row.label ?? '').trim(), value });
      return;
    }

    const key = referenceKey(clazz, value);
    const seq = row.stopSequence ?? null;
    const existing = byKey.get(key);
    if (existing) {
      if (seq !== null && !existing.citations.includes(seq)) existing.citations.push(seq);
      if (seq === null) existing.loadLevel = true;
      return;
    }
    byKey.set(key, {
      clazz,
      label: (row.label ?? '').trim() || spec.label,
      value,
      valueKey: referenceValueKey(value),
      citations: seq === null ? [] : [seq],
      loadLevel: seq === null,
    });
  });

  return { references: [...byKey.values()], routed, dropped };
}
