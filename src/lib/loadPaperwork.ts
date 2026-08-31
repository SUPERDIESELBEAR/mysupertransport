import type { LoadType } from '@/lib/loadRateMath';
import type { DocumentExceptionStatus, LoadDocumentType } from '@/lib/loadDocuments';
import {
  LOADOUT_STAGES, LOADOUT_STAGE_DOCUMENT_TYPE, LOADOUT_STAGE_LABEL, requiredLoadoutSlots,
} from '@/lib/loadoutSlots';


/**
 * Which documents a load owes, and whether it owes them hard.
 *
 * PURE. No supabase, no React, no queries — the caller already holds the
 * documents and the exceptions, and hands them in.
 *
 * Two levels exist because one is not enough. A BOL is wanted at origin and
 * frequently never materialises; requiring it would park loads on a driver's
 * chain forever, and omitting it entirely would mean nobody ever chases it.
 * So:
 *   'required' — the load is not finished until this is satisfied. Holds the
 *                load on the driver's chain.
 *   'expected' — should exist, is chased when missing, NEVER holds the load.
 */
export type PaperworkLevel = 'required' | 'expected';

export interface PaperworkRequirement {
  documentType: LoadDocumentType;
  level: PaperworkLevel;
  /** Human-readable, shown verbatim by every reader. */
  label: string;
  /**
   * When present, the requirement is satisfied only by a document of that type
   * ALSO carrying this photo label (trimmed, case-folded). Used for a specific
   * guided photo inside a larger set rather than a document type of its own.
   */
  photoLabel?: string;
}

/**
 * The default matrix, per load type. A plain constant, following the
 * DEFAULT_CHARGE_PAY_CLASSES precedent.
 *
 * Deliberately NOT configurable in this pass: there is no override parameter
 * and no policy column. An unused override argument is the same uncalled-code
 * pattern this project has shipped four times already. When a second carrier
 * needs a different matrix, the override path gets built then, against a real
 * requirement.
 *
 * Lumper receipts and detention documentation are deliberately absent: both are
 * accessorial-dependent and Module 5 does not exist yet.
 */
export const DEFAULT_LOAD_PAPERWORK: Record<LoadType, PaperworkRequirement[]> = {
  standard: [
    { documentType: 'pod', level: 'required', label: 'Proof of delivery' },
    { documentType: 'bol', level: 'expected', label: 'Bill of lading (collected at pickup)' },
  ],
  per_ton: [
    { documentType: 'pod', level: 'required', label: 'Proof of delivery' },
    { documentType: 'scale_ticket', level: 'required', label: 'Scale ticket' },
    { documentType: 'bol', level: 'expected', label: 'Bill of lading (collected at pickup)' },
  ],
  // A loadout owes NEITHER bol NOR pod. The guided photo package IS the POD.
  //
  // Derived, never re-listed: the required slots come from loadoutSlots.ts, the
  // same module the capture UI reads, so the two cannot disagree about what the
  // load owes.
  loadout: LOADOUT_STAGES.flatMap(stage =>
    requiredLoadoutSlots(stage).map<PaperworkRequirement>(slot => ({
      documentType: LOADOUT_STAGE_DOCUMENT_TYPE[stage],
      level: 'required',
      label: `${LOADOUT_STAGE_LABEL[stage]} — ${slot.title}`,
      photoLabel: slot.photoLabel,
    })),
  ),
};


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
  /** Everything considered, in matrix order. */
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
   * Scopes the exception to ONE guided photo. Loadout requirements all share a
   * single document_type, so an unscoped (NULL) exception must never satisfy a
   * requirement that carries a photoLabel — otherwise one waived number plate
   * clears the whole stage.
   */
  photo_label?: string | null;
}

function fold(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

/**
 * `is_verified` is deliberately NOT read. A document that exists counts.
 * Verification is a separate quality gate, and gating completeness on it would
 * park every delivered load behind an office click.
 */
function hasDocument(docs: PaperworkDocumentInput[], req: PaperworkRequirement): boolean {
  return docs.some(d => {
    if (d.document_type !== req.documentType) return false;
    if (!req.photoLabel) return true;
    return fold(d.photo_label) === fold(req.photoLabel);
  });
}

export function evaluateLoadPaperwork(
  loadType: LoadType | string | null | undefined,
  documents: PaperworkDocumentInput[] | null | undefined,
  exceptions: PaperworkExceptionInput[] | null | undefined,
): PaperworkStatus {
  const requirements = DEFAULT_LOAD_PAPERWORK[loadType as LoadType] ?? DEFAULT_LOAD_PAPERWORK.standard;
  const docs = documents ?? [];
  const excs = exceptions ?? [];

  const outstandingRequired: PaperworkRequirement[] = [];
  const outstandingExpected: PaperworkRequirement[] = [];
  const satisfied: SatisfiedRequirement[] = [];
  const pendingExceptions: PaperworkRequirement[] = [];

  requirements.forEach(req => {
    if (hasDocument(docs, req)) {
      satisfied.push({ requirement: req, satisfiedBy: 'document' });
      return;
    }

    const mine = excs.filter(e => {
      if (e.document_type !== req.documentType) return false;
      if (!req.photoLabel) return true;
      return fold(e.photo_label) === fold(req.photoLabel);
    });
    if (mine.some(e => e.status === 'approved')) {
      satisfied.push({ requirement: req, satisfiedBy: 'exception_approved' });
      return;
    }
    if (mine.some(e => e.status === 'resolved')) {
      satisfied.push({ requirement: req, satisfiedBy: 'exception_resolved' });
      return;
    }

    if (mine.some(e => e.status === 'pending')) pendingExceptions.push(req);

    if (req.level === 'required') outstandingRequired.push(req);
    else outstandingExpected.push(req);
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
