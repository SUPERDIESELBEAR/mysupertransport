import { classifyReferences, isPlaceholderReferenceValue, type ClassifyResult } from '@/lib/referenceClasses';
import { supabase } from '@/integrations/supabase/client';
import { emptyStop, type LoadFormValues, type StopFormValues } from '@/pages/dispatch/loadFormSchema';
import {
  normalizeImportedName, normalizePhone, normalizeWhitespace, normalizeZip, toTitleCase,
} from '@/lib/textNormalize';

import type { VerbatimVerification } from '@/lib/verbatimVerify';

export type { VerbatimVerification };

export type Confidence = 'high' | 'medium' | 'low';

export interface Field<T> { value: T | null; confidence: Confidence }

export interface ParsedReference { label: string; value: string; confidence: Confidence }

export interface ParsedStop {
  sequence: number;
  stop_type: StopFormValues['stop_type'];
  facility_name: Field<string>;
  address_line1: Field<string>;
  address_line2: Field<string>;
  city: Field<string>;
  state: Field<string>;
  zip: Field<string>;
  contact_name: Field<string>;
  contact_phone: Field<string>;
  appointment_start: Field<string>;
  appointment_end: Field<string>;
  notes: Field<string>;
  /** The stop's comment line exactly as printed. Never summarised. */
  notes_verbatim: Field<string>;
  references: ParsedReference[];
}

export interface ParsedRateLine {
  description: string;
  amount: number;
  category: 'linehaul' | 'fsc' | 'stopoff' | 'detention' | 'layover' | 'lumper' | 'tonu' | 'other';
  stop_hint: string | null;
  confidence: Confidence;
}

export type BrokerAddressSource = 'remit_to' | 'bill_to' | 'letterhead';

export interface ParsedRateConfirmation {
  broker: {
    company_name: Field<string>;
    mc_number: Field<string>;
    contact_name: Field<string>;
    contact_phone: Field<string>;
    contact_email: Field<string>;
    address_line1: Field<string>;
    address_line2: Field<string>;
    city: Field<string>;
    state: Field<string>;
    zip: Field<string>;
    /** Which printed block the address above came from; null when no address was captured. */
    address_source: BrokerAddressSource | null;
  };
  load: {
    broker_load_number: Field<string>;
    bol_number: Field<string>;
    po_number: Field<string>;
    equipment_type: Field<LoadFormValues['equipment_type']>;
    handling_type: Field<LoadFormValues['handling_type']>;
    commodity: Field<string>;
    weight_lbs: Field<number>;
    loaded_miles: Field<number>;
    is_hazmat: Field<boolean>;
    is_team_load: Field<boolean>;
    /** Categorical attribute printed in the References table (`Mode: TL`). */
    mode: Field<string>;
  };
  reefer: {
    temp_f: Field<number>;
    temp_min_f: Field<number>;
    temp_max_f: Field<number>;
    precool_required: Field<boolean>;
    continuous_run: Field<boolean>;
    notes: Field<string>;
  };
  rate: {
    linehaul: Field<number>;
    fsc_amount: Field<number>;
    total: Field<number>;
    line_items: ParsedRateLine[];
  };
  stops: ParsedStop[];
  /**
   * Condensed instructions for display. Derived; never the system of record.
   * The stored value is `verbatim.special_instructions`.
   */
  special_instructions: Field<string>;
  /**
   * Broker-authored text captured exactly as printed. The terms paragraph and
   * the Special Instructions block are separate fields on purpose — merging
   * them is what made the re-parse diff churn.
   */
  verbatim: {
    broker_terms: Field<string>;
    special_instructions: Field<string>;
  };
  /** Load-level References table rows, as printed. */
  references: ParsedReference[];
  loadout_signals: {
    no_bol_mentioned: boolean;
    photo_pod_required: boolean;
    multi_day_use_period: boolean;
    trailer_relocation_language: boolean;
    no_commodity: boolean;
    trailer_number: Field<string>;
    trailer_owner_company: Field<string>;
    relocation_fee: Field<number>;
    use_period_days: Field<number>;
    use_start_date?: Field<string>;
    use_end_date?: Field<string>;
  };
  /**
   * Per-field result of checking the verbatim captures against the PDF text
   * layer. Absent when the caller did not supply a text layer.
   */
  verbatim_verification?: VerbatimVerification[];
  /** Identity of the deployed parser that produced this result. */
  parser_build?: { contract: number; built_at: string; notes: string };
}

/**
 * The parser contract this client is written against.
 *
 * A stale deploy answering with an older contract once surfaced as three
 * unrelated-looking bugs, so divergence is reported rather than inferred.
 */
export const EXPECTED_PARSER_CONTRACT = 4;

/** Warning text when the deployed parser is not the one this build expects. */
export function parserContractWarning(result: ParsedRateConfirmation | null): string | null {
  const got = result?.parser_build?.contract;
  if (got === undefined || got === EXPECTED_PARSER_CONTRACT) return null;
  return `This app expects rate-confirmation parser contract ${EXPECTED_PARSER_CONTRACT}, but the deployed parser answered with contract ${got}. Extracted fields may be missing or shaped differently.`;
}

/** A rate line the dispatcher still has to place (or deliberately drop). */
export interface UnassignedRateLine extends ParsedRateLine { id: string }

export interface BrokerCandidate {
  id: string;
  company_name: string;
  mc_number: string | null;
  dot_number: string | null;
  city: string | null;
  state: string | null;
  primary_contact_name: string | null;
  /** 'mc' beats any name score — an MC number is unique. */
  matchedOn: 'mc' | 'name';
  score: number;
}

export const MAX_RATECON_BYTES = 20 * 1024 * 1024;

export const ACCEPTED_RATECON_MIME = [
  'application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
];

/** Only fill the form from values the model is sure about. */
const usable = <T,>(f?: Field<T> | null): T | null =>
  f && f.value !== null && f.value !== undefined && f.confidence !== 'low' ? f.value : null;

const needsCheck = <T,>(f?: Field<T> | null): boolean =>
  !!f && f.value !== null && f.value !== undefined && f.confidence === 'medium';

/** Labels a guard shack actually asks for. Anything else is not promoted into the field. */
const GATE_LABEL =
  /(^|\b)(pu|pick\s*up|pickup|delivery|del|dl|drop|bol|bill\s*of\s*lading|po|purchase\s*order|appt|appointment|confirmation|conf|pro|order|so|si|release|seal|shipment|load)\b/i;

/**
 * A stop's reference number. Only an explicitly labelled gate/invoice reference at
 * high or medium confidence is used — a bare internal code is left blank on purpose,
 * because a wrong number at a guard shack is worse than no number.
 */
export function pickReference(refs: ParsedReference[]): ParsedReference | null {
  if (!refs.length) return null;
  const rank: Record<Confidence, number> = { high: 0, medium: 1, low: 2 };
  return [...refs]
    // A stop's reference number goes through the same placeholder vocabulary as
    // the load-level references. "Assign at pickup" is an instruction printed
    // where a number goes, not an identifier, and filing it makes every future
    // load carry a phantom reference that duplicate checks will match on.
    .filter(r => r.confidence !== 'low'
      && GATE_LABEL.test(r.label ?? '')
      && !isPlaceholderReferenceValue(r.value))
    .sort((a, b) => rank[a.confidence] - rank[b.confidence])[0] ?? null;
}


export interface LoadoutAssessment { score: number; reasons: string[]; suspected: boolean }

/** Trailer relocations look nothing like freight: score the tells, never auto-switch. */
export function assessLoadout(p: ParsedRateConfirmation): LoadoutAssessment {
  const s = p.loadout_signals;
  const reasons: string[] = [];
  let score = 0;
  if (s.trailer_relocation_language) { score += 3; reasons.push('The document describes relocating a trailer, not hauling freight.'); }
  if (s.no_bol_mentioned) { score += 1; reasons.push('No bill of lading is mentioned anywhere.'); }
  if (s.photo_pod_required) { score += 2; reasons.push('Photos are named as the proof of delivery.'); }
  if (s.multi_day_use_period) { score += 2; reasons.push('The carrier may keep the trailer for a period of days.'); }
  if (s.no_commodity) { score += 1; reasons.push('No commodity is listed.'); }
  if (s.trailer_number.value) { score += 1; reasons.push(`A specific trailer is named (${s.trailer_number.value}).`); }
  return { score, reasons, suspected: score >= 4 };
}

const normName = (s: string) =>
  s.toLowerCase()
    .replace(/\b(inc\.?|llc\.?|l\.l\.c\.?|ltd\.?|corp\.?|co\.?|lp\.?|llp\.?)\b/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Token-overlap similarity — good enough to shortlist, never good enough to auto-pick. */
export function nameScore(a: string, b: string): number {
  const at = new Set(normName(a).split(' ').filter(Boolean));
  const bt = new Set(normName(b).split(' ').filter(Boolean));
  if (!at.size || !bt.size) return 0;
  let hit = 0;
  at.forEach(t => { if (bt.has(t)) hit += 1; });
  return hit / Math.max(at.size, bt.size);
}

/** MC first, then fuzzy name. The dispatcher always confirms the result. */
export async function matchBroker(
  parsed: ParsedRateConfirmation['broker'],
): Promise<BrokerCandidate[]> {
  const { data, error } = await supabase
    .from('brokers')
    .select('id, company_name, mc_number, dot_number, city, state, primary_contact_name')
    .order('company_name');
  if (error) throw error;
  const rows = data ?? [];

  const parsedMC = parsed.mc_number.value?.replace(/[^0-9]/g, '') ?? '';
  const parsedName = parsed.company_name.value ?? '';

  const candidates: BrokerCandidate[] = rows.map(b => ({
    id: b.id,
    company_name: b.company_name,
    mc_number: b.mc_number,
    dot_number: b.dot_number,
    city: b.city,
    state: b.state,
    primary_contact_name: b.primary_contact_name,
    matchedOn: 'name' as const,
    score: parsedName ? nameScore(parsedName, b.company_name) : 0,
  }));

  // Mark any MC-confirmed candidate as authoritative. Do not remove name-only
  // candidates; the dispatcher may still want to see them.
  if (parsedMC) {
    candidates.forEach(c => {
      const rowMC = (c.mc_number ?? '').replace(/[^0-9]/g, '');
      if (rowMC && rowMC === parsedMC) {
        c.matchedOn = 'mc';
        c.score = 1;
      }
    });
  }

  return candidates
    .filter(c => c.matchedOn === 'mc' || c.score >= 0.5)
    .sort((a, b) => {
      if (a.matchedOn === 'mc' && b.matchedOn !== 'mc') return -1;
      if (a.matchedOn !== 'mc' && b.matchedOn === 'mc') return 1;
      return b.score - a.score;
    })
    .slice(0, 4);
}

export interface ApplyResult {
  /** Human labels of fields filled at medium confidence — the dispatcher must verify these. */
  verify: string[];
  /** Rate lines that could not be placed automatically. */
  unassigned: UnassignedRateLine[];
  stopCount: number;
  /**
   * The reference classification, returned so the caller can log the labels the
   * class map did not recognise. Keeping it internal is how those misses went
   * unreported for as long as they did.
   */
  classified: ClassifyResult;
}

const numStr = (n: number | null) => (n === null ? '' : String(n));

/**
 * Writes parsed values into the Create Load form. Low-confidence values are left
 * blank on purpose — an empty field is safer than a wrong one.
 */
export function applyParsedToForm(
  p: ParsedRateConfirmation,
  set: (name: string, value: unknown) => void,
): ApplyResult {
  const verify: string[] = [];
  const put = (name: string, f: Field<string | number | boolean> | undefined, label: string) => {
    const v = usable(f as Field<unknown>);
    if (v === null) return;
    set(name, typeof v === 'boolean' ? v : String(v));
    if (needsCheck(f as Field<unknown>)) verify.push(label);
  };

  put('broker_reference_number', p.load.broker_load_number, "Broker's load #");
  put('bol_number', p.load.bol_number, 'BOL number');
  put('po_number', p.load.po_number, 'PO number');
  put('equipment_type', p.load.equipment_type, 'Equipment type');
  put('handling_type', p.load.handling_type, 'Handling type');
  put('commodity', p.load.commodity, 'Commodity');
  put('weight_lbs', p.load.weight_lbs, 'Weight');
  put('loaded_miles', p.load.loaded_miles, 'Loaded miles');
  put('is_hazmat', p.load.is_hazmat, 'Hazmat');
  put('is_team_load', p.load.is_team_load, 'Team load');
  put('special_instructions', p.special_instructions, 'Special instructions');
  // Verbatim blocks are written unconditionally, including at low confidence:
  // they are a transcription, not an inference, and an empty field here would
  // silently lose the only faithful copy of what the broker wrote.
  if (p.verbatim?.special_instructions?.value) {
    set('special_instructions_verbatim', p.verbatim.special_instructions.value);
  }
  if (p.verbatim?.broker_terms?.value) {
    set('broker_terms_verbatim', p.verbatim.broker_terms.value);
  }

  if (usable(p.load.equipment_type) === 'reefer') {
    put('reefer_temp_f', p.reefer.temp_f, 'Reefer temperature');
    put('reefer_temp_min_f', p.reefer.temp_min_f, 'Reefer min temp');
    put('reefer_temp_max_f', p.reefer.temp_max_f, 'Reefer max temp');
    put('reefer_precool_required', p.reefer.precool_required, 'Pre-cool required');
    put('reefer_continuous_run', p.reefer.continuous_run, 'Continuous run');
    put('reefer_notes', p.reefer.notes, 'Reefer notes');
  }

  const linehaul = usable(p.rate.linehaul);
  const fsc = usable(p.rate.fsc_amount);
  if (linehaul !== null) set('linehaul_rate', numStr(linehaul));
  if (fsc !== null) {
    set('fsc_bundled_into_linehaul', false);
    set('fsc_amount', numStr(fsc));
  }

  // ---- stops -------------------------------------------------------------
  const sorted = [...p.stops].sort((a, b) => a.sequence - b.sequence);
  const stops: StopFormValues[] = sorted.map((s, i) => {
    const base = emptyStop(s.stop_type ?? (i === 0 ? 'pickup' : 'delivery'));
    const ref = pickReference(s.references);
    const label = (name: string) => `Stop ${i + 1} ${name}`;
    const take = (f: Field<string>, fieldLabel: string) => {
      const v = usable(f);
      if (v !== null && needsCheck(f)) verify.push(label(fieldLabel));
      return v ?? '';
    };
    return {
      ...base,
      stop_type: s.stop_type ?? base.stop_type,
      facility_name: normalizeImportedName(take(s.facility_name, 'facility')),
      address_line1: toTitleCase(take(s.address_line1, 'address')),
      address_line2: toTitleCase(take(s.address_line2, 'address line 2')),
      city: toTitleCase(take(s.city, 'city')),
      state: (() => {
        const st = normalizeWhitespace(take(s.state, 'state'));
        return st.length <= 2 ? st.toUpperCase() : toTitleCase(st);
      })(),
      zip: normalizeZip(take(s.zip, 'ZIP')),
      contact_name: toTitleCase(take(s.contact_name, 'contact')),
      contact_phone: normalizePhone(take(s.contact_phone, 'phone')),
      appointment_start: take(s.appointment_start, 'appointment start'),
      appointment_end: take(s.appointment_end, 'appointment end'),
      stop_notes: take(s.notes, 'notes'),
      stop_notes_verbatim: s.notes_verbatim?.value ?? '',
      reference_number: ref && ref.confidence !== 'low' ? ref.value : '',
      reference_label: ref && ref.confidence !== 'low' ? ref.label : '',
      stopoff_charge_amount: '',
    };
  });

  while (stops.length < 2) stops.push(emptyStop(stops.length === 0 ? 'pickup' : 'delivery'));

  // ---- stop-off charges --------------------------------------------------
  // Only auto-assign on 3+ stop loads when the line clearly names one middle stop.
  const unassigned: UnassignedRateLine[] = [];
  p.rate.line_items.forEach((line, idx) => {
    if (line.category === 'linehaul' || line.category === 'fsc') return;
    const id = `line-${idx}`;
    if (line.category === 'stopoff' && stops.length >= 3 && line.confidence === 'high' && line.stop_hint) {
      const hint = line.stop_hint.toLowerCase();
      const middles = stops
        .map((s, i) => ({ s, i }))
        .filter(({ i }) => i > 0 && i < stops.length - 1);
      const hits = middles.filter(({ s, i }) =>
        (s.city && hint.includes(s.city.toLowerCase())) ||
        (s.facility_name && hint.includes(s.facility_name.toLowerCase())) ||
        new RegExp(`\\bstop\\s*${i + 1}\\b`).test(hint));
      if (hits.length === 1) {
        stops[hits[0].i].stopoff_charge_amount = String(line.amount);
        verify.push(`Stop ${hits[0].i + 1} stop-off charge`);
        return;
      }
    }
    unassigned.push({ ...line, id });
  });

  // ---- references --------------------------------------------------------
  // Classification decides what is an identifier and what is an attribute
  // wearing a reference label. `Mode: TL` routes to the load's own column;
  // storing it as a reference would fire duplicate warnings across every
  // truckload tender in the system.
  const classified = classifyReferences([
    ...(p.references ?? []).map(r => ({ label: r.label, value: r.value, stopSequence: null })),
    ...sorted.flatMap(st =>
      (st.references ?? []).map(r => ({ label: r.label, value: r.value, stopSequence: st.sequence }))),
  ]);
  const modeRow = classified.routed.find(r => r.routeTo === 'loads.mode');
  if (modeRow) set('mode', modeRow.value);
  else if (p.load.mode?.value) set('mode', String(p.load.mode.value));
  set('references', classified.references.map(r => ({
    reference_class: r.clazz,
    label: r.label,
    value: r.value,
    citations: r.citations,
  })));

  set('stops', stops);

  return { verify: Array.from(new Set(verify)), unassigned, stopCount: stops.length, classified };
}

/**
 * Loadout fields read off the document, collected — never written directly.
 *
 * This used to set `load_type` itself, which is how the banner bypassed the
 * amount carry. The load type is changed in exactly one place now
 * (`useLoadTypeChange`), and these fields are handed to it as part of that
 * single reversible operation.
 */
export function collectLoadoutFields(p: ParsedRateConfirmation): Record<string, string> {
  const out: Record<string, string> = {};
  applyLoadoutFields(p, (name, value) => { out[name] = String(value); });
  return out;
}

/** @deprecated Use collectLoadoutFields + useLoadTypeChange. Fills fields only. */
export function applyLoadoutFields(
  p: ParsedRateConfirmation,
  set: (name: string, value: unknown) => void,
) {
  const s = p.loadout_signals;
  if (usable(s.trailer_number) !== null) set('loadout_trailer_number', String(s.trailer_number.value));
  if (usable(s.trailer_owner_company) !== null) set('loadout_trailer_owner_company', String(s.trailer_owner_company.value));
  if (usable(s.relocation_fee) !== null) set('loadout_relocation_fee', String(s.relocation_fee.value));
  if (usable(s.use_period_days) !== null) set('loadout_use_period_days', String(s.use_period_days.value));
  if (s.use_start_date && usable(s.use_start_date) !== null) set('loadout_use_start', String(s.use_start_date.value));
  if (s.use_end_date && usable(s.use_end_date) !== null) set('loadout_use_end', String(s.use_end_date.value));
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

export function validateRateConFile(file: File): string | null {
  if (file.size > MAX_RATECON_BYTES) return 'That file is larger than 20 MB.';
  const mime = file.type || '';
  if (!ACCEPTED_RATECON_MIME.includes(mime)) return 'Upload a PDF or an image of the rate confirmation.';
  return null;
}
