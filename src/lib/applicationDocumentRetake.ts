export type RetakeDocumentKey = 'dl_front_url' | 'dl_rear_url' | 'medical_cert_url';

export const RETAKE_DOCUMENT_LABELS: Record<RetakeDocumentKey, string> = {
  dl_front_url: "Front of Driver's License",
  dl_rear_url: "Rear of Driver's License",
  medical_cert_url: 'Medical Certificate',
};

export const RETAKE_DOCUMENT_SHORT_LABELS: Record<RetakeDocumentKey, string> = {
  dl_front_url: 'DL Front',
  dl_rear_url: 'DL Rear',
  medical_cert_url: 'Medical Cert',
};

export const RETAKE_REASONS = [
  { value: 'blurry', label: 'Blurry / out of focus' },
  { value: 'cut_off', label: 'Edges cut off' },
  { value: 'glare', label: 'Glare or shadow over the text' },
  { value: 'unreadable', label: 'Text is not readable' },
  { value: 'expired', label: 'Document is expired' },
  { value: 'wrong_document', label: 'Wrong document uploaded' },
  { value: 'other', label: 'Other' },
] as const;

export type RetakeReason = (typeof RETAKE_REASONS)[number]['value'];

export function retakeReasonLabel(value: string | null | undefined): string {
  return RETAKE_REASONS.find(r => r.value === value)?.label ?? 'Needs a clearer copy';
}

export interface RetakeRequestEntry {
  reason?: string | null;
  note?: string | null;
  requested_at?: string | null;
  requested_by_name?: string | null;
}

export type RetakeRequestMap = Partial<Record<RetakeDocumentKey, RetakeRequestEntry>>;

/** Normalize the raw JSONB column into a typed map. */
export function parseRetakeRequests(raw: unknown): RetakeRequestMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: RetakeRequestMap = {};
  for (const key of Object.keys(RETAKE_DOCUMENT_LABELS) as RetakeDocumentKey[]) {
    const entry = (raw as Record<string, unknown>)[key];
    if (entry && typeof entry === 'object') out[key] = entry as RetakeRequestEntry;
  }
  return out;
}

/**
 * A retake is still outstanding only while the slot is empty. Once the
 * applicant (or staff) puts a new file in the slot the request is satisfied,
 * so no extra database write is needed to clear the flag.
 */
export function isRetakeOutstanding(
  requests: RetakeRequestMap,
  key: RetakeDocumentKey,
  currentPath: string | null | undefined,
): boolean {
  return Boolean(requests[key]) && !currentPath;
}