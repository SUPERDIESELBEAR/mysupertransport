import type { LoadType } from '@/lib/loadRateMath';
import type { DocumentExceptionStatus, LoadDocumentType } from '@/lib/loadDocuments';
import {
  LOADOUT_STAGES, LOADOUT_STAGE_DOCUMENT_TYPE, LOADOUT_STAGE_LABEL, requiredLoadoutSlots,
} from '@/lib/loadoutSlots';
import type { LoadoutStage } from '@/lib/loadoutSlots';


/**
 * Which documents a load owes, and whether it owes them hard.
 *
 * PURE. No supabase, no React, no queries — the caller already holds the
 * documents, the exceptions and the carrier's document settings (P79), and
 * hands them in. The database rule `invoice_readiness_missing` reads the SAME
 * settings; `evaluateInvoiceReadiness` below mirrors it line for line.
 *
 *   'required' — the load is not finished until this is satisfied. Holds the
 *                load on the driver's chain.
 *   'expected' — should exist, is chased when missing, NEVER holds the load.
 *                A BOL or POD that is not required stays 'expected'.
 */
export type PaperworkLevel = 'required' | 'expected';

export interface PaperworkRequirement {
  documentType: LoadDocumentType;
  level: PaperworkLevel;
  /** Human-readable, shown verbatim by every reader. */
  label: string;
  /**
   * When present, the requirement is satisfied only by a document of that type
   * ALSO carrying this photo label (trimmed, case-folded).
   */
  photoLabel?: string;
}

/* ------------------------------------------------------------------ settings */

export type RequiredChoice = 'always' | 'when_applies' | 'no';
export type AppliesWhen = 'lumper_billed' | 'per_ton' | 'detention_billed' | 'loadout';

export interface DocumentRequirementRow {
  document_type: string;
  required_before_invoicing: RequiredChoice | string;
  applies_when?: AppliesWhen | string | null;
  in_packet: boolean;
  position: number;
}

export interface DocumentRequirementSettings {
  /** "BOL or POD — either one is enough" (P79). */
  bolOrPodEither: boolean;
  rows: DocumentRequirementRow[];
}

/** The fixed "When it applies" condition; same as document_requirement_condition(). */
export const APPLIES_WHEN: Partial<Record<string, AppliesWhen>> = {
  lumper_receipt: 'lumper_billed',
  scale_ticket: 'per_ton',
  detention_documentation: 'detention_billed',
  loadout_pickup_inspection: 'loadout',
  loadout_delivery_inspection: 'loadout',
};

export const APPLIES_WHEN_LABEL: Record<AppliesWhen, string> = {
  lumper_billed: 'when a lumper is billed',
  per_ton: 'on per-ton loads',
  detention_billed: 'when detention is billed',
  loadout: 'on loadouts',
};

/** Same wording as document_requirement_label(). */
export const REQUIREMENT_LABEL: Record<string, string> = {
  invoice: 'Invoice',
  bol: 'Bill of lading',
  pod: 'Proof of delivery',
  rate_confirmation: 'Rate confirmation',
  revised_rate_confirmation: 'Revised rate confirmation',
  lumper_receipt: 'Lumper receipt',
  scale_ticket: 'Scale ticket',
  detention_documentation: 'Detention documentation',
  loadout_pickup_inspection: 'Pickup inspection photos',
  loadout_delivery_inspection: 'Delivery inspection photos',
  permit: 'Permit',
  broker_correspondence: 'Broker correspondence',
  reimbursement_proof: 'Reimbursement proof',
  other: 'Other document',
};

const DEFAULT_ORDER = [
  'invoice', 'bol', 'pod', 'rate_confirmation', 'revised_rate_confirmation', 'lumper_receipt',
  'scale_ticket', 'detention_documentation', 'loadout_pickup_inspection', 'loadout_delivery_inspection',
  'permit', 'broker_correspondence', 'reimbursement_proof', 'other',
];

/** Same as document_requirement_defaults(): reproduces P73 exactly. */
export const DEFAULT_DOCUMENT_REQUIREMENTS: DocumentRequirementSettings = {
  bolOrPodEither: true,
  rows: DEFAULT_ORDER.map((t, i) => ({
    document_type: t,
    required_before_invoicing: t === 'rate_confirmation' ? 'always'
      : ['lumper_receipt', 'scale_ticket', 'loadout_pickup_inspection', 'loadout_delivery_inspection'].includes(t)
        ? 'when_applies' : 'no',
    applies_when: APPLIES_WHEN[t] ?? null,
    in_packet: !['broker_correspondence', 'reimbursement_proof', 'other'].includes(t),
    position: i + 1,
  })),
};

/** Documents a driver uploads. Everything else is checked only at invoicing. */
export const DRIVER_DOCUMENT_TYPES: LoadDocumentType[] = [
  'bol', 'pod', 'scale_ticket', 'lumper_receipt',
  'loadout_pickup_inspection', 'loadout_delivery_inspection', 'detention_documentation',
];

export interface LoadChargeContext {
  lumperBilled?: boolean;
  detentionBilled?: boolean;
}

/** An empty row list means "no settings saved": the built-in defaults apply (same as the database). */
function effectiveRows(settings: DocumentRequirementSettings | null | undefined): DocumentRequirementRow[] {
  const rows = settings?.rows?.length ? settings.rows : DEFAULT_DOCUMENT_REQUIREMENTS.rows;
  return [...rows].sort((a, b) => a.position - b.position || (a.document_type < b.document_type ? -1 : 1));
}

function applies(row: DocumentRequirementRow, loadType: string | null | undefined, ctx: LoadChargeContext): boolean {
  if (row.required_before_invoicing === 'always') return true;
  if (row.required_before_invoicing !== 'when_applies') return false;
  switch (APPLIES_WHEN[row.document_type]) {
    case 'lumper_billed': return !!ctx.lumperBilled;
    case 'detention_billed': return !!ctx.detentionBilled;
    case 'per_ton': return loadType === 'per_ton';
    case 'loadout': return loadType === 'loadout';
    default: return false;
  }
}

const LOADOUT_TYPES: string[] = ['loadout_pickup_inspection', 'loadout_delivery_inspection'];
const STAGE_FOR_TYPE: Record<string, LoadoutStage> = {
  loadout_pickup_inspection: 'pickup',
  loadout_delivery_inspection: 'delivery',
};

function loadoutSlotRequirements(documentType: string): PaperworkRequirement[] {
  const stage = STAGE_FOR_TYPE[documentType];
  return requiredLoadoutSlots(stage).map(slot => ({
    documentType: LOADOUT_STAGE_DOCUMENT_TYPE[stage],
    level: 'required' as const,
    label: `${LOADOUT_STAGE_LABEL[stage]} — ${slot.title}`,
    photoLabel: slot.photoLabel,
  }));
}

/** Driver-facing wording, unchanged from P73. */
const DRIVER_LABEL: Partial<Record<string, string>> = {
  pod: 'Proof of delivery',
  bol: 'Bill of lading (collected at pickup)',
};

/**
 * The default matrix per load type, as the built-in defaults produce it.
 * Kept for readers that list what a load type owes by default.
 */
export const DEFAULT_LOAD_PAPERWORK: Record<LoadType, PaperworkRequirement[]> = {
  standard: [
    { documentType: 'pod', level: 'expected', label: 'Proof of delivery' },
    { documentType: 'bol', level: 'expected', label: 'Bill of lading (collected at pickup)' },
  ],
  per_ton: [
    { documentType: 'pod', level: 'expected', label: 'Proof of delivery' },
    { documentType: 'scale_ticket', level: 'required', label: 'Scale ticket' },
    { documentType: 'bol', level: 'expected', label: 'Bill of lading (collected at pickup)' },
  ],
  loadout: LOADOUT_STAGES.flatMap(stage => loadoutSlotRequirements(LOADOUT_STAGE_DOCUMENT_TYPE[stage])),
};

/* ---------------------------------------------------------------- evaluation */

export type SatisfiedBy = 'document' | 'exception_approved' | 'exception_resolved';

export interface SatisfiedRequirement {
  requirement: PaperworkRequirement;
  satisfiedBy: SatisfiedBy;
}

export interface PaperworkStatus {
  /** True when zero REQUIRED items are outstanding. Expected items never affect it. */
  complete: boolean;
  outstandingRequired: PaperworkRequirement[];
  outstandingExpected: PaperworkRequirement[];
  satisfied: SatisfiedRequirement[];
  /** Unmet requirements with an exception filed but not yet reviewed. */
  pendingExceptions: PaperworkRequirement[];
  /** Everything considered, in settings order. */
  requirements: PaperworkRequirement[];
}

/** Inputs are structurally typed so callers can pass rows from any reader. */
export interface PaperworkDocumentInput {
  document_type: LoadDocumentType | string;
  photo_label?: string | null;
}

export interface PaperworkExceptionInput {
  document_type: LoadDocumentType | string;
  status: DocumentExceptionStatus | string;
  /**
   * Scopes the exception to ONE guided photo. An unscoped (NULL) exception
   * never satisfies a requirement that carries a photoLabel.
   */
  photo_label?: string | null;
}

function fold(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

/**
 * Same test as _load_has_paperwork(): a document of one of the types, or an
 * approved or resolved exception. `is_verified` is deliberately not read.
 */
function satisfiedBy(
  docs: PaperworkDocumentInput[], excs: PaperworkExceptionInput[], types: string[], photoLabel?: string,
): SatisfiedBy | null {
  const match = (t: string, label: string | null | undefined) =>
    types.includes(t) && (!photoLabel || fold(label) === fold(photoLabel));
  if (docs.some(d => match(d.document_type, d.photo_label))) return 'document';
  const mine = excs.filter(e => match(e.document_type, e.photo_label));
  if (mine.some(e => e.status === 'approved')) return 'exception_approved';
  if (mine.some(e => e.status === 'resolved')) return 'exception_resolved';
  return null;
}

const SIGNED_LABEL = 'Signed delivery paperwork — BOL or POD';

export function evaluateLoadPaperwork(
  loadType: LoadType | string | null | undefined,
  documents: PaperworkDocumentInput[] | null | undefined,
  exceptions: PaperworkExceptionInput[] | null | undefined,
  settings: DocumentRequirementSettings | null = DEFAULT_DOCUMENT_REQUIREMENTS,
  charges: LoadChargeContext = {},
): PaperworkStatus {
  const docs = documents ?? [];
  const excs = exceptions ?? [];
  const either = settings?.bolOrPodEither ?? true;
  const ordinary = loadType !== 'loadout';

  const requirements: PaperworkRequirement[] = [];
  const outstandingRequired: PaperworkRequirement[] = [];
  const outstandingExpected: PaperworkRequirement[] = [];
  const satisfied: SatisfiedRequirement[] = [];
  const pendingExceptions: PaperworkRequirement[] = [];

  const hasPending = (req: PaperworkRequirement, types: string[]) => excs.some(e =>
    types.includes(e.document_type) && e.status === 'pending'
    && (!req.photoLabel || fold(e.photo_label) === fold(req.photoLabel)));

  const consider = (req: PaperworkRequirement, types: string[]) => {
    requirements.push(req);
    const by = satisfiedBy(docs, excs, types, req.photoLabel);
    if (by) { satisfied.push({ requirement: req, satisfiedBy: by }); return; }
    if (hasPending(req, types)) pendingExceptions.push(req);
    if (req.level === 'required') outstandingRequired.push(req);
    else outstandingExpected.push(req);
  };

  // P73/P79: with the switch on, either a BOL or a POD completes ordinary paperwork.
  let signedSatisfied = false;
  if (either && ordinary) {
    signedSatisfied = !!satisfiedBy(docs, excs, ['bol', 'pod']);
    if (!signedSatisfied) {
      const req: PaperworkRequirement = { documentType: 'pod', level: 'required', label: SIGNED_LABEL };
      requirements.push(req);
      outstandingRequired.push(req);
      if (hasPending(req, ['bol', 'pod'])) pendingExceptions.push(req);
    }
  }

  effectiveRows(settings).forEach(row => {
    const type = row.document_type;
    if (!DRIVER_DOCUMENT_TYPES.includes(type as LoadDocumentType)) return;
    const isSigned = type === 'bol' || type === 'pod';
    if (applies(row, loadType, charges)) {
      if (LOADOUT_TYPES.includes(type) && loadType === 'loadout') {
        loadoutSlotRequirements(type).forEach(req => consider(req, [type]));
        return;
      }
      consider({
        documentType: type as LoadDocumentType, level: 'required',
        label: DRIVER_LABEL[type] ?? REQUIREMENT_LABEL[type] ?? type,
      }, [type]);
      return;
    }
    // Chase behaviour: a BOL or POD that is not required stays 'expected' on
    // ordinary loads — but not while the "either one" item is still open.
    if (isSigned && ordinary && !(either && !signedSatisfied)) {
      consider({ documentType: type as LoadDocumentType, level: 'expected', label: DRIVER_LABEL[type]! }, [type]);
    }
  });

  return {
    complete: outstandingRequired.length === 0,
    outstandingRequired,
    outstandingExpected,
    satisfied,
    pendingExceptions,
    requirements,
  };
}

/* ------------------------------------------------ invoicing (mirrors the DB) */

export interface ReadinessBroker {
  address_line1?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  factoring_status?: string | null;
}

export interface InvoiceReadinessInput {
  loadType: LoadType | string | null | undefined;
  documents: PaperworkDocumentInput[];
  exceptions: PaperworkExceptionInput[];
  settings: DocumentRequirementSettings | null;
  charges: LoadChargeContext;
  /** null when the load has no broker of this carrier. */
  broker: ReadinessBroker | null;
  hasDefaultFactor: boolean;
}

const blank = (v: string | null | undefined) => !(v ?? '').trim();

/**
 * The missing-items list `invoice_readiness_missing` returns, computed in
 * TypeScript from the same inputs. Same items, same order.
 */
export function evaluateInvoiceReadiness(input: InvoiceReadinessInput): string[] {
  const { loadType, documents: docs, exceptions: excs, settings, charges, broker, hasDefaultFactor } = input;
  const missing: string[] = [];
  const either = settings?.bolOrPodEither ?? true;

  if (either && loadType !== 'loadout' && !satisfiedBy(docs, excs, ['bol', 'pod'])) missing.push(SIGNED_LABEL);

  effectiveRows(settings).forEach(row => {
    const type = row.document_type;
    if (type === 'invoice' || !applies(row, loadType, charges)) return;
    if (LOADOUT_TYPES.includes(type) && loadType === 'loadout') {
      loadoutSlotRequirements(type).forEach(req => {
        if (!satisfiedBy(docs, excs, [type], req.photoLabel)) missing.push(req.label);
      });
      return;
    }
    const types = type === 'rate_confirmation' ? ['rate_confirmation', 'revised_rate_confirmation'] : [type];
    if (!satisfiedBy(docs, excs, types)) missing.push(REQUIREMENT_LABEL[type] ?? type);
  });

  if (!broker || blank(broker.address_line1) || blank(broker.city) || blank(broker.state) || blank(broker.zip)) {
    missing.push('Broker billing address');
  }
  if (broker && broker.factoring_status === 'not_approved' && hasDefaultFactor) {
    missing.push('Broker is marked not approved by the factor');
  }
  return missing;
}

/** Label for a requirement satisfied by an exception rather than a document. */
export function waivedSummary(entry: SatisfiedRequirement): string | null {
  if (entry.satisfiedBy === 'exception_approved') {
    return `${entry.requirement.label} — waived by approved exception.`;
  }
  if (entry.satisfiedBy === 'exception_resolved') {
    return `${entry.requirement.label} — exception resolved.`;
  }
  return null;
}
