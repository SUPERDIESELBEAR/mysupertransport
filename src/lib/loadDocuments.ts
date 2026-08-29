import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

export type LoadDocumentType = Database['public']['Enums']['load_document_type'];
export type DocumentExceptionStatus = Database['public']['Enums']['document_exception_status'];
export type LoadDocumentRow = Database['public']['Tables']['load_documents']['Row'];
export type DocumentExceptionRow = Database['public']['Tables']['document_exceptions']['Row'];

export const LOAD_DOCUMENTS_BUCKET = 'load-documents';

/** Short window — every URL is minted at the moment it is needed. */
export const SIGNED_URL_TTL_SECONDS = 300;

export const MAX_LOAD_DOC_BYTES = 25 * 1024 * 1024; // 25 MB

export const ALLOWED_LOAD_DOC_MIME = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/heic',
  'image/heif',
  'image/webp',
] as const;

const EXT_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
  heif: 'image/heif',
  webp: 'image/webp',
};

/** Document types shown as list rows, in operational priority order. */
export const DOCUMENT_TYPE_ORDER: LoadDocumentType[] = [
  'rate_confirmation',
  'revised_rate_confirmation',
  'bol',
  'pod',
  'scale_ticket',
  'lumper_receipt',
  'reimbursement_proof',
  'detention_documentation',
  'permit',
  'broker_correspondence',
  'other',
];

export const LOADOUT_PHOTO_TYPES: LoadDocumentType[] = [
  'loadout_pickup_inspection',
  'loadout_delivery_inspection',
];

export const PHOTO_LABEL_SUGGESTIONS = [
  'Front',
  'Driver Side',
  'Passenger Side',
  'Rear Doors Closed',
  'Rear Doors Open',
  'Trailer Number Plate',
  'Delivery Location Signage',
  'Other',
] as const;

export const EXCEPTION_REASON_LABELS: Record<Database['public']['Enums']['document_exception_reason'], string> = {
  shipper_did_not_provide: 'Shipper did not provide the document',
  receiver_refused_to_sign: 'Receiver refused to sign',
  lost_or_damaged: 'Document lost or damaged',
  will_be_emailed_later: 'Will be emailed later',
  electronic_bol_no_paper: 'Electronic BOL — no paper copy',
  facility_closed_no_contact: 'Facility closed, no contact available',
  other: 'Other',
};

export interface LoadDocument extends LoadDocumentRow {
  uploaded_by_name: string | null;
  file_size: number | null;
}

export interface LoadDocumentException extends DocumentExceptionRow {
  reported_by_name: string | null;
  resolved_by_name: string | null;
  resolving_document_name: string | null;
}

export function isImageDocument(doc: { file_type: string | null; document_name: string | null; file_path: string | null }): boolean {
  const t = doc.file_type ?? '';
  if (t.startsWith('image/')) return true;
  const name = doc.document_name || doc.file_path || '';
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return (EXT_MIME[ext] ?? '').startsWith('image/');
}

export function resolveMimeType(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return EXT_MIME[ext] ?? '';
}

/** Client-side gate so unsupported files never reach storage. */
export function validateLoadDocumentFile(file: File): { valid: boolean; error?: string } {
  if (file.size > MAX_LOAD_DOC_BYTES) {
    return {
      valid: false,
      error: `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 25 MB.`,
    };
  }
  const mime = resolveMimeType(file);
  if (!(ALLOWED_LOAD_DOC_MIME as readonly string[]).includes(mime)) {
    return {
      valid: false,
      error: `${file.name} is not an accepted file type. Upload a PDF, JPG, PNG, HEIC, or WebP.`,
    };
  }
  return { valid: true };
}

/** Loadout inspection photos must be images — PDFs are not valid POD/condition photos. */
export function validateLoadoutPhotoFile(file: File): { valid: boolean; error?: string } {
  const base = validateLoadDocumentFile(file);
  if (!base.valid) return base;
  const mime = resolveMimeType(file);
  if (!mime.startsWith('image/')) {
    return {
      valid: false,
      error: `${file.name} is not an image. Inspection photos must be JPG, PNG, HEIC, or WebP.`,
    };
  }
  return { valid: true };
}

export function formatFileSize(bytes: number | null | undefined): string | null {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const nameOf = (p?: { first_name: string | null; last_name: string | null } | null) =>
  [p?.first_name, p?.last_name].filter(Boolean).join(' ').trim() || null;

async function profileNames(ids: (string | null)[]): Promise<Map<string, string | null>> {
  const unique = Array.from(new Set(ids.filter(Boolean))) as string[];
  const map = new Map<string, string | null>();
  if (!unique.length) return map;
  const { data } = await supabase
    .from('profiles')
    .select('id, first_name, last_name')
    .in('id', unique);
  (data ?? []).forEach(p => map.set(p.id, nameOf(p)));
  return map;
}

/** File sizes come from storage metadata — the table has no size column. */
async function fileSizes(loadId: string, docs: LoadDocumentRow[]): Promise<Map<string, number>> {
  const sizes = new Map<string, number>();
  const folders = Array.from(new Set(
    docs.map(d => d.file_path?.split('/').slice(0, -1).join('/')).filter(Boolean) as string[],
  ));
  await Promise.all(folders.map(async folder => {
    const { data } = await supabase.storage.from(LOAD_DOCUMENTS_BUCKET).list(folder, { limit: 1000 });
    (data ?? []).forEach(obj => {
      const size = (obj.metadata as { size?: number } | null)?.size;
      if (typeof size === 'number') sizes.set(`${folder}/${obj.name}`, size);
    });
  }));
  return sizes;
}

export async function fetchLoadDocuments(loadId: string): Promise<LoadDocument[]> {
  const { data, error } = await supabase
    .from('load_documents')
    .select('*')
    .eq('load_id', loadId)
    .order('uploaded_at', { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as LoadDocumentRow[];
  const [names, sizes] = await Promise.all([
    profileNames(rows.map(r => r.uploaded_by)),
    fileSizes(loadId, rows).catch(() => new Map<string, number>()),
  ]);

  return rows.map(r => ({
    ...r,
    uploaded_by_name: r.uploaded_by ? names.get(r.uploaded_by) ?? null : null,
    file_size: r.file_path ? sizes.get(r.file_path) ?? null : null,
  }));
}

export async function fetchLoadDocumentExceptions(loadId: string): Promise<LoadDocumentException[]> {
  const { data, error } = await supabase
    .from('document_exceptions')
    .select('*')
    .eq('load_id', loadId)
    .order('reported_at', { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as DocumentExceptionRow[];
  const names = await profileNames([
    ...rows.map(r => r.reported_by),
    ...rows.map(r => r.resolved_by),
  ]);

  const docIds = Array.from(new Set(rows.map(r => r.resolving_document_id).filter(Boolean))) as string[];
  const docNames = new Map<string, string | null>();
  if (docIds.length) {
    const { data: docs } = await supabase
      .from('load_documents')
      .select('id, document_name')
      .in('id', docIds);
    (docs ?? []).forEach(d => docNames.set(d.id, d.document_name));
  }

  return rows.map(r => ({
    ...r,
    reported_by_name: r.reported_by ? names.get(r.reported_by) ?? null : null,
    resolved_by_name: r.resolved_by ? names.get(r.resolved_by) ?? null : null,
    resolving_document_name: r.resolving_document_id ? docNames.get(r.resolving_document_id) ?? null : null,
  }));
}

/**
 * Mint a signed URL on demand. Never call this in bulk while rendering a list —
 * URLs are short-lived by design, so they must be created at the moment of use.
 */
export async function createDocumentSignedUrl(filePath: string): Promise<string> {
  const { data, error } = await supabase
    .storage
    .from(LOAD_DOCUMENTS_BUCKET)
    .createSignedUrl(filePath, SIGNED_URL_TTL_SECONDS);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error('Could not create a link for this file.');
  return data.signedUrl;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-120) || 'file';
}

export type LoadoutStickerState = Database['public']['Enums']['loadout_sticker_state'];
export type LoadDocumentUploadChannel = Database['public']['Enums']['document_upload_channel'];

export interface UploadLoadDocumentInput {
  loadId: string;
  documentType: LoadDocumentType;
  loadStopId?: string | null;
  notes?: string | null;
  file: File;
  /** Where the file came from. Driver capture must say so. */
  uploadChannel?: LoadDocumentUploadChannel;
  /** Photo-only metadata for loadout inspection uploads. */
  photoLabel?: string | null;
  photoSequence?: number | null;
  damageNoted?: boolean | null;
  damageNotes?: string | null;
  /** Annual inspection sticker answer — pickup inspections only. */
  inspectionStickerState?: LoadoutStickerState | null;
  /** ISO date, only meaningful when the state is 'recorded'. */
  inspectionStickerExpiry?: string | null;
}

/** Uploads one file and records it. `uploaded_by` is stamped server-side. */
/** Uploads a load document and returns the new `load_documents` row id. */
export async function uploadLoadDocument(input: UploadLoadDocumentInput): Promise<string> {

  const {
    loadId, documentType, loadStopId, notes, file, uploadChannel,
    photoLabel, photoSequence, damageNoted, damageNotes,
    inspectionStickerState, inspectionStickerExpiry,
  } = input;
  const contentType = resolveMimeType(file) || 'application/octet-stream';
  const path = `${loadId}/${documentType}/${crypto.randomUUID()}-${sanitizeFilename(file.name)}`;

  const { error: upErr } = await supabase
    .storage
    .from(LOAD_DOCUMENTS_BUCKET)
    .upload(path, file, { contentType, upsert: false });
  if (upErr) throw upErr;

  const isPhotoType = LOADOUT_PHOTO_TYPES.includes(documentType);
  const isPickup = documentType === 'loadout_pickup_inspection';
  const { data: inserted, error: insErr } = await supabase.from('load_documents').insert({
    load_id: loadId,
    load_stop_id: loadStopId || null,
    document_type: documentType,
    document_name: file.name,
    file_path: path,
    file_type: contentType,
    upload_channel: uploadChannel ?? 'office_upload',
    notes: notes?.trim() ? notes.trim() : null,
    photo_label: isPhotoType ? (photoLabel?.trim() ? photoLabel.trim() : null) : null,
    photo_sequence: isPhotoType ? photoSequence ?? null : null,
    damage_noted: isPhotoType ? damageNoted ?? false : false,
    damage_notes: isPhotoType && damageNoted ? (damageNotes?.trim() ? damageNotes.trim() : null) : null,
    inspection_sticker_state: isPickup ? inspectionStickerState ?? null : null,
    inspection_sticker_expiry:
      isPickup && inspectionStickerState === 'recorded' ? inspectionStickerExpiry || null : null,
  }).select('id').single();
  if (insErr) {
    // Roll back the orphaned object so storage does not drift from the table.
    await supabase.storage.from(LOAD_DOCUMENTS_BUCKET).remove([path]).catch(() => undefined);
    throw insErr;
  }
  return inserted.id as string;
}

/**
 * "No sticker found" — an answer with no photo behind it.
 *
 * It still lands in load_documents so the sticker lives in ONE place regardless
 * of which of the three answers was given, and so the paperwork predicate sees
 * the slot satisfied. Absence is information; a blank field is ambiguity.
 */
export async function recordLoadoutStickerNotFound(
  loadId: string,
  photoLabel: string,
  loadStopId?: string | null,
): Promise<string> {
  const { data, error } = await supabase.from('load_documents').insert({
    load_id: loadId,
    load_stop_id: loadStopId || null,
    document_type: 'loadout_pickup_inspection',
    document_name: 'No annual inspection sticker found',
    upload_channel: 'driver_app',
    photo_label: photoLabel,
    inspection_sticker_state: 'not_found',
  }).select('id').single();
  if (error) throw error;
  return data.id as string;
}

/**
 * A damage note raises a WATCH claim on the load — never HOLD. This is a record,
 * not a dispute, and it must not stop settlement. The RPC appends to the load's
 * existing WATCH flag rather than creating a second one.
 */
export async function recordLoadoutDamageFlag(loadId: string, note: string): Promise<void> {
  const { error } = await supabase.rpc('record_loadout_damage_flag', {
    _load_id: loadId,
    _note: note,
  });
  if (error) throw error;
}


/** Replaces a load document's notes, e.g. when a reviewed file is later applied. */
export async function setLoadDocumentNotes(documentId: string, notes: string): Promise<void> {
  const { error } = await supabase
    .from('load_documents')
    .update({ notes: notes.trim() || null })
    .eq('id', documentId);
  if (error) throw error;
}



export async function deleteLoadDocument(doc: { id: string; file_path: string | null }): Promise<void> {
  if (doc.file_path) {
    const { error } = await supabase.storage.from(LOAD_DOCUMENTS_BUCKET).remove([doc.file_path]);
    if (error) throw error;
  }
  const { error } = await supabase.from('load_documents').delete().eq('id', doc.id);
  if (error) throw error;
}

export interface ResolveExceptionInput {
  exceptionId: string;
  status: Exclude<DocumentExceptionStatus, 'pending'>;
  resolutionNotes: string;
  resolvingDocumentId?: string | null;
}

/** `resolved_at` / `resolved_by` are stamped by a database trigger. */
export async function resolveDocumentException(input: ResolveExceptionInput): Promise<void> {
  const { error } = await supabase
    .from('document_exceptions')
    .update({
      status: input.status,
      resolution_notes: input.resolutionNotes.trim(),
      resolving_document_id: input.status === 'resolved' ? input.resolvingDocumentId ?? null : null,
    })
    .eq('id', input.exceptionId);
  if (error) throw error;
}
