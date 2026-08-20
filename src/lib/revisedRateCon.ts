import type { LoadFormValues, StopFormValues } from '@/pages/dispatch/loadFormSchema';
import type { Confidence, Field, ParsedRateConfirmation, ParsedStop } from '@/lib/rateConfirmation';
import { pickReference } from '@/lib/rateConfirmation';
import { normalizeAddressKey, normalizeZipKey } from '@/lib/facilityMatch';
import { toLocalInput } from '@/lib/loadEdit';
import {
  normalizeImportedName, normalizePhone, normalizeWhitespace, normalizeZip, toTitleCase,
} from '@/lib/textNormalize';

/**
 * Re-parsing a REVISED rate confirmation onto an existing load.
 *
 * Nothing here writes. It produces a reviewable diff; the dispatcher accepts,
 * rejects and classifies, and `applyRevision` folds the accepted decisions back
 * into the same `LoadFormValues` the edit form uses, so the save goes out through
 * `update_load_with_stops` unchanged.
 */

/* ------------------------------------------------------------------ */
/* Shared helpers                                                       */
/* ------------------------------------------------------------------ */

/** Same rule the create-form parser uses: low confidence is never trusted. */
const use = <T,>(f?: Field<T> | null): T | null =>
  f && f.value !== null && f.value !== undefined && (f.confidence as Confidence) !== 'low'
    ? f.value
    : null;

const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};
const money = (a: number, b: number) => Math.round((a - b) * 100) / 100;

/* ------------------------------------------------------------------ */
/* Document identity — is this even the same load?                      */
/* ------------------------------------------------------------------ */

export interface IdentityCheckInput {
  /** MC number on the load's linked broker, if any. */
  loadBrokerMc: string | null;
  loadBrokerName: string | null;
  loadReference: string | null;
}

export interface IdentityCheck {
  /** The document belongs to a different broker: refuse outright. */
  brokerMismatch: boolean;
  /** Same broker, different load reference: blocking gate the dispatcher can override. */
  referenceMismatch: boolean;
  docReference: string | null;
  docBroker: string | null;
  docMc: string | null;
  loadReference: string | null;
  loadBroker: string | null;
  loadMc: string | null;
}

const digits = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '');
const refKey = (v: string | null | undefined) =>
  (v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export function checkDocumentIdentity(
  parsed: ParsedRateConfirmation, load: IdentityCheckInput,
): IdentityCheck {
  const docMc = use(parsed.broker.mc_number);
  const docBroker = use(parsed.broker.company_name);
  const docReference = use(parsed.load.broker_load_number);

  const bothMc = digits(docMc) && digits(load.loadBrokerMc);
  const brokerMismatch = !!bothMc && digits(docMc) !== digits(load.loadBrokerMc);

  // A load with no reference on file is not a mismatch — the document is supplying one.
  const referenceMismatch =
    !!refKey(docReference) && !!refKey(load.loadReference) &&
    refKey(docReference) !== refKey(load.loadReference);

  return {
    brokerMismatch,
    referenceMismatch,
    docReference,
    docBroker,
    docMc,
    loadReference: load.loadReference,
    loadBroker: load.loadBrokerName,
    loadMc: load.loadBrokerMc,
  };
}

/* ------------------------------------------------------------------ */
/* Stop matching                                                        */
/* ------------------------------------------------------------------ */

export type StopMatchMode = 'address' | 'position' | 'unresolved';

export interface StopMatch {
  parsedIndex: number;
  /** Index into the load's current stops, or null when nothing matched. */
  existingIndex: number | null;
  mode: StopMatchMode;
}

/** Dispatcher's answer for a parsed stop the code could not place. */
export type StopResolution = number | 'new' | 'ignore';

const addrKeyOf = (s: { address_line1?: string | null; zip?: string | null }) => {
  const a = normalizeAddressKey(s.address_line1);
  const z = normalizeZipKey(s.zip);
  return a && z ? `${a}|${z}` : '';
};

const cityKeyOf = (s: { city?: string | null; state?: string | null }) =>
  `${(s.city ?? '').trim().toLowerCase()}|${(s.state ?? '').trim().toLowerCase()}`;

/**
 * Two passes, then honest ambiguity.
 *
 * 1. Address identity (street + 5-digit ZIP) — positional independence lets a stop
 *    that moved in the sequence still match.
 * 2. Position identity — same index, same stop type, same city/state. This is the
 *    corrected-address case.
 * 3. Anything left is `unresolved`; the dispatcher decides. Nothing is deleted.
 */
export function matchParsedStops(
  parsedStops: { stop_type?: string | null; address_line1?: string | null; zip?: string | null;
    city?: string | null; state?: string | null }[],
  existingStops: StopFormValues[],
): StopMatch[] {
  const taken = new Set<number>();
  const matches: StopMatch[] = parsedStops.map((_, i) => ({
    parsedIndex: i, existingIndex: null, mode: 'unresolved' as StopMatchMode,
  }));

  parsedStops.forEach((p, i) => {
    const key = addrKeyOf(p);
    if (!key) return;
    const hit = existingStops.findIndex((e, ei) => !taken.has(ei) && addrKeyOf(e) === key);
    if (hit >= 0) {
      taken.add(hit);
      matches[i] = { parsedIndex: i, existingIndex: hit, mode: 'address' };
    }
  });

  parsedStops.forEach((p, i) => {
    if (matches[i].existingIndex !== null) return;
    const e = existingStops[i];
    if (!e || taken.has(i)) return;
    const sameType = !p.stop_type || p.stop_type === e.stop_type;
    if (sameType && cityKeyOf(p) === cityKeyOf(e) && cityKeyOf(e) !== '|') {
      taken.add(i);
      matches[i] = { parsedIndex: i, existingIndex: i, mode: 'position' };
    }
  });

  return matches;
}

/* ------------------------------------------------------------------ */
/* Diff model                                                           */
/* ------------------------------------------------------------------ */

export interface NonFinancialDiff {
  id: string;
  label: string;
  /** Dot path into LoadFormValues, e.g. `commodity` or `stops.1.city`. */
  path: string;
  stopIndex: number | null;
  current: string;
  revised: string;
  /** Value written when the row is accepted. */
  value: unknown;
  /** The driver already checked in or out at this stop. */
  hasDriverData: boolean;
  /** Reject-by-default when the driver has already worked the stop. */
  defaultAccept: boolean;
}

export type ClassificationKey =
  | 'linehaul' | 'fsc' | 'detention' | 'stopoff' | 'lumper' | 'layover' | 'tonu' | 'other';

export const CLASSIFICATION_LABELS: Record<ClassificationKey, string> = {
  linehaul: 'Linehaul rate correction',
  fsc: 'Fuel surcharge correction',
  detention: 'Detention',
  stopoff: 'Stop-off charge',
  lumper: 'Lumper reimbursement',
  layover: 'Layover',
  tonu: 'TONU',
  other: 'Other',
};

/** Options offered for every money change, in the order the dispatcher reads them. */
export const CLASSIFICATION_OPTIONS: ClassificationKey[] = [
  'linehaul', 'fsc', 'detention', 'stopoff', 'lumper', 'layover', 'tonu', 'other',
];

/** Classifications that settle at 100% to the driver — surfaced as a hint in the UI. */
export const FULL_PAY_CLASSIFICATIONS: ClassificationKey[] = ['detention', 'lumper', 'layover'];

export interface FinancialDiff {
  id: string;
  label: string;
  /** Which part of the load the document changed. */
  kind: 'linehaul' | 'fsc' | 'charge';
  current: number;
  revised: number;
  /** revised − current. Negative for a reduction. */
  delta: number;
  /** Pre-selected when the document itemizes the line; still needs confirming. */
  suggested: ClassificationKey | null;
  /** The document's own wording for the line, used as the charge description. */
  description: string;
  /** Index into LoadFormValues.charges when this adjusts an existing charge. */
  existingChargeIndex: number | null;
}

export interface RevisionDiff {
  nonFinancial: NonFinancialDiff[];
  financial: FinancialDiff[];
  stopMatches: StopMatch[];
  /** Parsed stop indexes the code refused to place. */
  unresolved: number[];
  /** Sum of accepted-at-face-value deltas, for the header line. */
  totalDelta: number;
}

export interface DiffDecisions {
  accepted: Record<string, boolean>;
  classifications: Record<string, ClassificationKey>;
  /** Required free text when a financial row is classified as "other". */
  descriptions: Record<string, string>;
  /** Dispatcher answers for unresolved parsed stops. */
  stopResolutions: Record<number, StopResolution>;
}

const CATEGORY_TO_CLASS: Record<string, ClassificationKey> = {
  linehaul: 'linehaul',
  fsc: 'fsc',
  detention: 'detention',
  stopoff: 'stopoff',
  lumper: 'lumper',
  layover: 'layover',
  tonu: 'tonu',
  other: 'other',
};

interface StopFieldSpec {
  key: keyof StopFormValues;
  label: string;
  read: (p: ParsedStop) => string | null;
}

const STOP_FIELDS: StopFieldSpec[] = [
  { key: 'facility_name', label: 'Facility', read: p => nz(use(p.facility_name), normalizeImportedName) },
  { key: 'address_line1', label: 'Address', read: p => nz(use(p.address_line1), toTitleCase) },
  { key: 'address_line2', label: 'Address line 2', read: p => nz(use(p.address_line2), toTitleCase) },
  { key: 'city', label: 'City', read: p => nz(use(p.city), toTitleCase) },
  {
    key: 'state',
    label: 'State',
    read: p => nz(use(p.state), v => {
      const st = normalizeWhitespace(v);
      return st.length <= 2 ? st.toUpperCase() : toTitleCase(st);
    }),
  },
  { key: 'zip', label: 'ZIP', read: p => nz(use(p.zip), normalizeZip) },
  { key: 'contact_name', label: 'Contact', read: p => nz(use(p.contact_name), toTitleCase) },
  { key: 'contact_phone', label: 'Contact phone', read: p => nz(use(p.contact_phone), normalizePhone) },
  { key: 'appointment_start', label: 'Appointment start', read: p => nz(use(p.appointment_start), toLocalInput) },
  { key: 'appointment_end', label: 'Appointment end', read: p => nz(use(p.appointment_end), toLocalInput) },
  { key: 'stop_notes', label: 'Stop notes', read: p => use(p.notes) },
  { key: 'reference_number', label: 'Reference number', read: p => pickReference(p.references ?? [])?.value ?? null },
  { key: 'reference_label', label: 'Reference label', read: p => pickReference(p.references ?? [])?.label ?? null },
];

function nz(v: string | null, fn: (s: string) => string): string | null {
  if (v === null) return null;
  const out = fn(String(v));
  return out === '' ? null : out;
}

/** Fields whose change never affects what the broker is billed. */
interface LoadFieldSpec {
  key: keyof LoadFormValues;
  label: string;
  read: (p: ParsedRateConfirmation) => string | boolean | number | null;
}

const LOAD_FIELDS: LoadFieldSpec[] = [
  { key: 'broker_reference_number', label: "Broker's load #", read: p => use(p.load.broker_load_number) },
  { key: 'bol_number', label: 'BOL number', read: p => use(p.load.bol_number) },
  { key: 'po_number', label: 'PO number', read: p => use(p.load.po_number) },
  { key: 'equipment_type', label: 'Equipment type', read: p => use(p.load.equipment_type) },
  { key: 'handling_type', label: 'Handling type', read: p => use(p.load.handling_type) },
  { key: 'commodity', label: 'Commodity', read: p => use(p.load.commodity) },
  { key: 'weight_lbs', label: 'Weight', read: p => use(p.load.weight_lbs) },
  { key: 'is_hazmat', label: 'Hazmat', read: p => use(p.load.is_hazmat) },
  { key: 'is_team_load', label: 'Team load', read: p => use(p.load.is_team_load) },
  { key: 'special_instructions', label: 'Special instructions', read: p => use(p.special_instructions) },
];

const sameText = (a: unknown, b: unknown) => text(a).trim() === text(b).trim();

/**
 * Every field where the revised document disagrees with the load as it stands.
 * `resolutions` carries the dispatcher's answers for stops the matcher could not place,
 * so the diff can be rebuilt as they resolve them.
 */
export function buildRevisionDiff(
  current: LoadFormValues,
  parsed: ParsedRateConfirmation,
  resolutions: Record<number, StopResolution> = {},
): RevisionDiff {
  const nonFinancial: NonFinancialDiff[] = [];
  const financial: FinancialDiff[] = [];

  LOAD_FIELDS.forEach(spec => {
    const revised = spec.read(parsed);
    if (revised === null) return;
    const cur = current[spec.key];
    if (typeof revised === 'boolean') {
      if (!!cur === revised) return;
      nonFinancial.push({
        id: `load.${spec.key}`, label: spec.label, path: String(spec.key), stopIndex: null,
        current: cur ? 'Yes' : 'No', revised: revised ? 'Yes' : 'No', value: revised,
        hasDriverData: false, defaultAccept: true,
      });
      return;
    }
    if (sameText(cur, revised)) return;
    nonFinancial.push({
      id: `load.${spec.key}`, label: spec.label, path: String(spec.key), stopIndex: null,
      current: text(cur) || '—', revised: text(revised), value: String(revised),
      hasDriverData: false, defaultAccept: true,
    });
  });

  // Loaded miles only move money on a per-mile load; elsewhere they are informational.
  const revisedMiles = use(parsed.load.loaded_miles);
  if (revisedMiles !== null && !sameText(current.loaded_miles, revisedMiles)) {
    if (current.rate_type === 'per_mile') {
      const cur = num(current.loaded_miles);
      financial.push({
        id: 'fin.loaded_miles', label: 'Loaded miles (per-mile rate)', kind: 'linehaul',
        current: cur, revised: num(revisedMiles), delta: money(num(revisedMiles), cur),
        suggested: 'linehaul', description: 'Loaded miles corrected on the revised rate confirmation',
        existingChargeIndex: null,
      });
    } else {
      nonFinancial.push({
        id: 'load.loaded_miles', label: 'Loaded miles', path: 'loaded_miles', stopIndex: null,
        current: text(current.loaded_miles) || '—', revised: text(revisedMiles),
        value: String(revisedMiles), hasDriverData: false, defaultAccept: true,
      });
    }
  }

  // ---- stops -------------------------------------------------------------
  const parsedStops = [...(parsed.stops ?? [])].sort((a, b) => a.sequence - b.sequence);
  const matches = matchParsedStops(parsedStops, current.stops ?? []);

  const resolved = matches.map(m => {
    if (m.existingIndex !== null) return m;
    const answer = resolutions[m.parsedIndex];
    if (typeof answer === 'number') {
      return { ...m, existingIndex: answer, mode: 'position' as StopMatchMode };
    }
    return m;
  });

  resolved.forEach(m => {
    if (m.existingIndex === null) return;
    const p = parsedStops[m.parsedIndex];
    const e = (current.stops ?? [])[m.existingIndex];
    if (!p || !e) return;
    const hasDriverData = !!e.has_driver_data;

    STOP_FIELDS.forEach(spec => {
      const revised = spec.read(p);
      if (revised === null) return;
      const cur = e[spec.key];
      if (sameText(cur, revised)) return;
      nonFinancial.push({
        id: `stop.${m.existingIndex}.${String(spec.key)}`,
        label: `Stop ${(m.existingIndex as number) + 1} — ${spec.label}`,
        path: `stops.${m.existingIndex}.${String(spec.key)}`,
        stopIndex: m.existingIndex,
        current: text(cur) || '—',
        revised: text(revised),
        value: String(revised),
        hasDriverData,
        // A stop the driver has already worked is never rewritten by default.
        defaultAccept: !hasDriverData,
      });
    });
  });

  const unresolved = resolved
    .filter(m => m.existingIndex === null && resolutions[m.parsedIndex] !== 'ignore')
    .map(m => m.parsedIndex);

  // ---- money -------------------------------------------------------------
  const revisedLinehaul = use(parsed.rate.linehaul);
  if (revisedLinehaul !== null) {
    const cur = num(current.linehaul_rate);
    const delta = money(num(revisedLinehaul), cur);
    if (delta !== 0) {
      financial.push({
        id: 'fin.linehaul', label: 'Linehaul rate', kind: 'linehaul',
        current: cur, revised: num(revisedLinehaul), delta,
        suggested: 'linehaul',
        description: 'Linehaul on the revised rate confirmation',
        existingChargeIndex: null,
      });
    }
  }

  const revisedFsc = use(parsed.rate.fsc_amount);
  if (revisedFsc !== null) {
    const cur = current.fsc_bundled_into_linehaul ? 0 : num(current.fsc_amount);
    const delta = money(num(revisedFsc), cur);
    if (delta !== 0) {
      financial.push({
        id: 'fin.fsc', label: 'Fuel surcharge', kind: 'fsc',
        current: cur, revised: num(revisedFsc), delta,
        suggested: 'fsc',
        description: 'Fuel surcharge on the revised rate confirmation',
        existingChargeIndex: null,
      });
    }
  }

  const usedCharge = new Set<number>();
  (parsed.rate.line_items ?? []).forEach((line, idx) => {
    if (line.category === 'linehaul' || line.category === 'fsc') return;
    const amount = num(line.amount);
    const existingIndex = (current.charges ?? []).findIndex(
      (c, ci) => !usedCharge.has(ci) && (c.charge_type || 'other') === line.category,
    );
    const cur = existingIndex >= 0 ? num(current.charges[existingIndex].amount) : 0;
    if (existingIndex >= 0) usedCharge.add(existingIndex);
    const delta = money(amount, cur);
    if (delta === 0) return;
    financial.push({
      id: `fin.line-${idx}`,
      label: line.description || CLASSIFICATION_LABELS[CATEGORY_TO_CLASS[line.category] ?? 'other'],
      kind: 'charge',
      current: cur,
      revised: amount,
      delta,
      suggested: CATEGORY_TO_CLASS[line.category] ?? null,
      description: line.description || '',
      existingChargeIndex: existingIndex >= 0 ? existingIndex : null,
    });
  });

  const totalDelta = Math.round(financial.reduce((s, f) => s + f.delta, 0) * 100) / 100;

  return { nonFinancial, financial, stopMatches: resolved, unresolved, totalDelta };
}

/** Accept/reject defaults, and the pre-selected classification for each money row. */
export function initialDecisions(diff: RevisionDiff): DiffDecisions {
  const accepted: Record<string, boolean> = {};
  const classifications: Record<string, ClassificationKey> = {};
  diff.nonFinancial.forEach(d => { accepted[d.id] = d.defaultAccept; });
  diff.financial.forEach(d => {
    // Money is never accepted until the dispatcher confirms what it is.
    accepted[d.id] = false;
    if (d.suggested) classifications[d.id] = d.suggested;
  });
  return { accepted, classifications, descriptions: {}, stopResolutions: {} };
}

/** A financial row cannot be applied until it is classified (and described, if "other"). */
export function financialRowReady(d: FinancialDiff, decisions: DiffDecisions): boolean {
  if (!decisions.accepted[d.id]) return true;
  const c = decisions.classifications[d.id];
  if (!c) return false;
  if (c === 'other' && !(decisions.descriptions[d.id] ?? '').trim()) return false;
  return true;
}

/* ------------------------------------------------------------------ */
/* Applying                                                             */
/* ------------------------------------------------------------------ */

const setPath = (values: LoadFormValues, path: string, value: unknown): LoadFormValues => {
  const parts = path.split('.');
  if (parts[0] === 'stops') {
    const index = Number(parts[1]);
    const key = parts[2] as keyof StopFormValues;
    const stops = [...(values.stops ?? [])];
    if (!stops[index]) return values;
    stops[index] = { ...stops[index], [key]: value } as StopFormValues;
    return { ...values, stops };
  }
  return { ...values, [parts[0]]: value } as LoadFormValues;
};

export interface ApplyRevisionResult {
  values: LoadFormValues;
  /** One line per applied money change, for the automatic change reason. */
  financialSummary: string[];
}

/**
 * Folds the accepted decisions into the current form values.
 *
 * Money follows the classification, not the document layout: only a linehaul
 * correction touches `linehaul_rate`, and only an FSC correction touches
 * `fsc_amount`. Everything else becomes a `load_charges` row of its own type,
 * which is what makes it settle correctly against the driver's pay policy.
 */
export function applyRevision(
  current: LoadFormValues, diff: RevisionDiff, decisions: DiffDecisions,
): ApplyRevisionResult {
  let values: LoadFormValues = { ...current, stops: [...(current.stops ?? [])] };
  const financialSummary: string[] = [];

  diff.nonFinancial.forEach(d => {
    if (!decisions.accepted[d.id]) return;
    values = setPath(values, d.path, d.value);
  });

  const charges = [...(values.charges ?? [])];

  diff.financial.forEach(d => {
    if (!decisions.accepted[d.id]) return;
    const klass = decisions.classifications[d.id];
    if (!klass) return;
    const description = klass === 'other'
      ? (decisions.descriptions[d.id] ?? '').trim()
      : (d.description || CLASSIFICATION_LABELS[klass]);

    if (klass === 'linehaul') {
      const next = d.kind === 'linehaul'
        ? d.revised
        : Math.round((num(values.linehaul_rate) + d.delta) * 100) / 100;
      values = { ...values, linehaul_rate: String(next) };
      financialSummary.push(`linehaul ${signed(d.delta)} (rate correction)`);
      return;
    }

    if (klass === 'fsc') {
      const currentFsc = values.fsc_bundled_into_linehaul ? 0 : num(values.fsc_amount);
      const next = d.kind === 'fsc'
        ? d.revised
        : Math.round((currentFsc + d.delta) * 100) / 100;
      values = { ...values, fsc_bundled_into_linehaul: false, fsc_amount: String(next) };
      financialSummary.push(`fuel surcharge ${signed(d.delta)}`);
      return;
    }

    if (d.existingChargeIndex !== null && charges[d.existingChargeIndex]) {
      charges[d.existingChargeIndex] = {
        ...charges[d.existingChargeIndex],
        charge_type: klass,
        description,
        amount: String(d.revised),
        source: 'revised_rate_confirmation',
      };
      financialSummary.push(`${CLASSIFICATION_LABELS[klass].toLowerCase()} ${signed(d.delta)}`);
      return;
    }

    const amount = d.kind === 'charge' ? d.revised : d.delta;
    if (amount <= 0) {
      // A reduction with no charge row to reduce can only come off the source field.
      if (d.kind === 'fsc') {
        values = { ...values, fsc_bundled_into_linehaul: false, fsc_amount: String(d.revised) };
      } else {
        values = { ...values, linehaul_rate: String(d.revised) };
      }
      financialSummary.push(`${d.label.toLowerCase()} ${signed(d.delta)}`);
      return;
    }

    charges.push({
      charge_type: klass,
      description,
      amount: String(amount),
      source: 'revised_rate_confirmation',
    });
    financialSummary.push(`${CLASSIFICATION_LABELS[klass].toLowerCase()} ${signed(d.delta)}`);
  });

  values = { ...values, charges };
  return { values, financialSummary };
}

const signed = (n: number) => `${n >= 0 ? '+' : '-'}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/* ------------------------------------------------------------------ */
/* Automatic change reason                                              */
/* ------------------------------------------------------------------ */

export interface ReasonInput {
  receivedAt?: Date;
  financialSummary: string[];
  /** The dispatcher confirmed a differing broker reference is the same load. */
  referenceOverride?: { docReference: string | null; loadReference: string | null } | null;
  addition?: string;
}

/** The document is the justification — the dispatcher never has to type one. */
export function buildRevisionReason(input: ReasonInput): string {
  const d = input.receivedAt ?? new Date();
  const parts = [`Revised rate confirmation received ${d.getMonth() + 1}/${d.getDate()}`];
  if (input.financialSummary.length) parts.push(input.financialSummary.join('; '));
  if (input.referenceOverride) {
    parts.push(
      `Dispatcher confirmed same load despite broker reference ${input.referenceOverride.docReference ?? '—'} on the document vs ${input.referenceOverride.loadReference ?? '—'} on file`,
    );
  }
  const extra = (input.addition ?? '').trim();
  if (extra) parts.push(extra);
  return parts.join(' — ');
}
