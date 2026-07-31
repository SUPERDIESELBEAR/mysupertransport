import type { RodsDay } from './rodsTypes';

/**
 * Fields that must NOT carry over from a certified log into its amendment
 * draft. Everything else is cloned by default.
 *
 * This inversion is deliberate. The previous implementation enumerated what to
 * copy, so every column added to rods_days silently failed to clone --
 * main_office_address and home_terminal_timezone were added for carrier_profile,
 * added to certify_rods_day's twelve-field guard, and never added to the copy
 * list, which made every amendment uncertifiable the moment the driver signed
 * it. With a copy-everything default, a new column is cloned automatically and
 * only an explicit decision keeps it out.
 */
export const AMENDMENT_RESET_FIELDS = {
  /** Identity and row bookkeeping: the database issues these. */
  id: undefined,
  created_at: undefined,
  updated_at: undefined,

  /** Certification state: the amendment starts unsigned. */
  status: 'draft',
  locked: false,
  certified_at: null,
  certified_by: null,
  certification_legal_name: null,
  certification_signature_path: null,
  certification_device_info: null,
  certification_token: null,

  /** Artifacts of the original signing. Regenerated when this one certifies. */
  pdf_path: null,

  /**
   * An amendment is always keyed, even when it amends an ELD-produced day:
   * the driver is re-entering the record by hand, so the uploaded document
   * does not describe this row.
   */
  record_source: 'keyed',
  source_document_path: null,

  /** Set per amendment by the caller, not inherited. */
  supersedes_day_id: null,
  amendment_reason: null,
} as const;

/** Column names dropped entirely from the insert payload. */
const OMITTED_KEYS = ['id', 'created_at', 'updated_at'] as const;

/**
 * Build the insert payload for an amendment draft of `original`.
 *
 * Copies the whole row, then overrides only what must differ. Header fields,
 * carrier fields, totals, recap figures and any column added in future are
 * cloned without further code changes.
 */
export function buildAmendmentDraft(original: RodsDay): Record<string, unknown> {
  const draft: Record<string, unknown> = { ...(original as unknown as Record<string, unknown>) };

  for (const [key, value] of Object.entries(AMENDMENT_RESET_FIELDS)) {
    if (value === undefined) continue;
    draft[key] = value;
  }
  for (const key of OMITTED_KEYS) delete draft[key];

  draft.supersedes_day_id = original.id;
  return draft;
}
