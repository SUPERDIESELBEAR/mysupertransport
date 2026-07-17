/**
 * Mutations for notification triage: mark read/unread, snooze, assign,
 * archive, and their bulk variants. All calls target `public.notifications`
 * and rely on the recipient/assignee RLS policies.
 */
import { supabase } from '@/integrations/supabase/client';

const TABLE = 'notifications' as const;

export async function markRead(id: string) {
  await supabase.from(TABLE).update({ read_at: new Date().toISOString() }).eq('id', id);
}

export async function markUnread(id: string) {
  await supabase.from(TABLE).update({ read_at: null }).eq('id', id);
}

export async function markManyRead(ids: string[]) {
  if (!ids.length) return;
  await supabase.from(TABLE).update({ read_at: new Date().toISOString() }).in('id', ids);
}

export type SnoozePreset = '1h' | 'tomorrow' | 'next_monday';

export function snoozeTimestamp(preset: SnoozePreset): string {
  const now = new Date();
  const d = new Date(now);
  if (preset === '1h') d.setHours(d.getHours() + 1);
  else if (preset === 'tomorrow') {
    d.setDate(d.getDate() + 1);
    d.setHours(8, 0, 0, 0);
  } else if (preset === 'next_monday') {
    const day = d.getDay(); // 0 Sun … 6 Sat
    const daysUntilMonday = ((8 - day) % 7) || 7;
    d.setDate(d.getDate() + daysUntilMonday);
    d.setHours(8, 0, 0, 0);
  }
  return d.toISOString();
}

export async function snooze(id: string, preset: SnoozePreset) {
  await supabase.from(TABLE).update({ snoozed_until: snoozeTimestamp(preset) }).eq('id', id);
}

export async function snoozeMany(ids: string[], preset: SnoozePreset) {
  if (!ids.length) return;
  await supabase.from(TABLE).update({ snoozed_until: snoozeTimestamp(preset) }).in('id', ids);
}

export async function unsnooze(id: string) {
  await supabase.from(TABLE).update({ snoozed_until: null }).eq('id', id);
}

export async function assign(id: string, userId: string | null) {
  await supabase.from(TABLE).update({ assigned_to: userId }).eq('id', id);
}

export async function assignMany(ids: string[], userId: string | null) {
  if (!ids.length) return;
  await supabase.from(TABLE).update({ assigned_to: userId }).in('id', ids);
}

export async function archive(id: string) {
  await supabase.from(TABLE).update({ archived_at: new Date().toISOString() }).eq('id', id);
}

export async function archiveMany(ids: string[]) {
  if (!ids.length) return;
  await supabase.from(TABLE).update({ archived_at: new Date().toISOString() }).in('id', ids);
}

export async function unarchive(id: string) {
  await supabase.from(TABLE).update({ archived_at: null }).eq('id', id);
}
