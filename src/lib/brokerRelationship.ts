import { supabase } from '@/integrations/supabase/client';
import { uploadToBucket } from '@/lib/uploadWithAuth';
import type { BrokerContactRole } from '@/lib/brokers';

export const BROKER_DOCS_BUCKET = 'broker-documents';

export type BrokerDocumentCategory = 'carrier_packet' | 'signed_broker_agreement' | 'other';

export interface BrokerContact {
  id: string;
  broker_id: string;
  name: string;
  role: BrokerContactRole;
  phone: string | null;
  email: string | null;
  notes: string | null;
  is_primary: boolean;
  created_at: string;
  created_by: string | null;
}

export interface BrokerNote {
  id: string;
  broker_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  author_name: string | null;
}

export interface BrokerDocument {
  id: string;
  broker_id: string;
  document_category: string;
  document_name: string;
  file_path: string | null;
  file_url: string | null;
  created_at: string | null;
}

export interface BrokerDoNotLoadEvent {
  id: string;
  previous_value: boolean | null;
  new_value: boolean;
  reason: string | null;
  changed_at: string;
  actor_name: string | null;
}

/* ---------------------------------------------------------------- contacts */

export async function fetchBrokerContacts(brokerId: string): Promise<BrokerContact[]> {
  const { data, error } = await supabase
    .from('broker_contacts')
    .select('id, broker_id, name, role, phone, email, notes, is_primary, created_at, created_by')
    .eq('broker_id', brokerId)
    .order('is_primary', { ascending: false })
    .order('role', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as BrokerContact[];
}

export interface BrokerContactInput {
  name: string;
  role: BrokerContactRole;
  phone: string | null;
  email: string | null;
  notes: string | null;
  is_primary: boolean;
}

/**
 * Only one primary per broker is allowed by a partial unique index, so an
 * incoming primary clears the existing one first rather than failing the save.
 */
async function clearOtherPrimaries(brokerId: string, exceptId?: string) {
  let q = supabase.from('broker_contacts').update({ is_primary: false })
    .eq('broker_id', brokerId).eq('is_primary', true);
  if (exceptId) q = q.neq('id', exceptId);
  const { error } = await q;
  if (error) throw error;
}

export async function insertBrokerContact(brokerId: string, input: BrokerContactInput) {
  if (input.is_primary) await clearOtherPrimaries(brokerId);
  // created_by / updated_by are stamped server-side and never sent from here.
  const { error } = await supabase.from('broker_contacts').insert({ broker_id: brokerId, ...input });
  if (error) throw error;
}

export async function updateBrokerContact(id: string, brokerId: string, input: BrokerContactInput) {
  if (input.is_primary) await clearOtherPrimaries(brokerId, id);
  const { error } = await supabase.from('broker_contacts').update(input).eq('id', id);
  if (error) throw error;
}

export async function deleteBrokerContact(id: string) {
  const { error } = await supabase.from('broker_contacts').delete().eq('id', id);
  if (error) throw error;
}

/* ------------------------------------------------------------------- notes */

interface NoteRow {
  id: string;
  broker_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  author?: { full_name: string | null } | null;
}

/** Attributed running record — newest first. Never overwritten as a blob. */
export async function fetchBrokerNotes(brokerId: string): Promise<BrokerNote[]> {
  const { data, error } = await supabase
    .from('broker_notes')
    .select('id, broker_id, body, created_at, updated_at, created_by, author:profiles!broker_notes_created_by_fkey(full_name)')
    .eq('broker_id', brokerId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as NoteRow[]).map(r => ({
    id: r.id,
    broker_id: r.broker_id,
    body: r.body,
    created_at: r.created_at,
    updated_at: r.updated_at,
    created_by: r.created_by,
    author_name: r.author?.full_name ?? null,
  }));
}

export async function addBrokerNote(brokerId: string, body: string) {
  const { error } = await supabase.from('broker_notes').insert({ broker_id: brokerId, body });
  if (error) throw error;
}

export async function deleteBrokerNote(id: string) {
  const { error } = await supabase.from('broker_notes').delete().eq('id', id);
  if (error) throw error;
}

/* --------------------------------------------------------------- documents */

export async function fetchBrokerDocuments(brokerId: string): Promise<BrokerDocument[]> {
  const { data, error } = await supabase
    .from('broker_documents')
    .select('id, broker_id, document_category, document_name, file_path, file_url, created_at')
    .eq('broker_id', brokerId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as BrokerDocument[];
}

export async function uploadBrokerDocument(
  brokerId: string,
  category: BrokerDocumentCategory,
  file: File,
): Promise<BrokerDocument> {
  const safeName = file.name.replace(/[^\w.\-]+/g, '_');
  const path = `${brokerId}/${category}/${Date.now()}_${safeName}`;
  const { error: upErr } = await uploadToBucket(BROKER_DOCS_BUCKET, path, file, {
    contentType: file.type || undefined,
  });
  if (upErr) throw upErr;

  const { data, error } = await supabase.from('broker_documents').insert({
    broker_id: brokerId,
    document_category: category,
    document_name: file.name,
    file_path: path,
  }).select('id, broker_id, document_category, document_name, file_path, file_url, created_at').single();
  if (error) throw error;
  return data as BrokerDocument;
}

export async function brokerDocumentUrl(doc: BrokerDocument): Promise<string | null> {
  if (!doc.file_path) return doc.file_url ?? null;
  const { data, error } = await supabase.storage
    .from(BROKER_DOCS_BUCKET)
    .createSignedUrl(doc.file_path, 600);
  if (error) throw error;
  return data?.signedUrl ?? null;
}

/* -------------------------------------------------------- do-not-load log */

interface DnlRow {
  id: string;
  previous_value: boolean | null;
  new_value: boolean;
  reason: string | null;
  changed_at: string;
  actor?: { full_name: string | null } | null;
}

export async function fetchDoNotLoadHistory(brokerId: string): Promise<BrokerDoNotLoadEvent[]> {
  const { data, error } = await supabase
    .from('broker_do_not_load_history')
    .select('id, previous_value, new_value, reason, changed_at, actor:profiles!broker_do_not_load_history_changed_by_fkey(full_name)')
    .eq('broker_id', brokerId)
    .order('changed_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as DnlRow[]).map(r => ({
    id: r.id,
    previous_value: r.previous_value,
    new_value: r.new_value,
    reason: r.reason,
    changed_at: r.changed_at,
    actor_name: r.actor?.full_name ?? null,
  }));
}

/**
 * Audit trail for proceeding with a load against a do-not-load broker. Written
 * from the selection surface only — the load save path is untouched.
 */
export async function logDoNotLoadOverride(broker: { id: string; company_name: string; do_not_load_reason: string | null }, reason: string) {
  const { error } = await supabase.from('audit_log').insert({
    action: 'broker_do_not_load_override',
    entity_type: 'broker',
    entity_id: broker.id,
    entity_label: broker.company_name,
    metadata: { reason, do_not_load_reason: broker.do_not_load_reason },
  });
  if (error) throw error;
}
