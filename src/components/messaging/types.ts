export interface MessageReaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  thread_id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  sent_at: string;
  read_at: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  pinned_at: string | null;
  pinned_by: string | null;
  reply_to_id: string | null;
  attachment_url: string | null;
  attachment_name: string | null;
  attachment_mime: string | null;
  attachment_size_bytes: number | null;
}

export const MESSAGE_SELECT =
  'id, thread_id, sender_id, recipient_id, body, sent_at, read_at, edited_at, deleted_at, pinned_at, pinned_by, reply_to_id, attachment_url, attachment_name, attachment_mime, attachment_size_bytes';

export const QUICK_EMOJIS = ['👍', '❤️', '✅', '😂', '🎉', '😮'];

export const EDIT_WINDOW_MS = 5 * 60 * 1000;

/** Group reactions by emoji and return [emoji, count, didIReact] tuples */
export function groupReactions(
  reactions: MessageReaction[],
  myUserId: string | null
): { emoji: string; count: number; mine: boolean }[] {
  const map = new Map<string, { count: number; mine: boolean }>();
  for (const r of reactions) {
    const cur = map.get(r.emoji) ?? { count: 0, mine: false };
    cur.count += 1;
    if (r.user_id === myUserId) cur.mine = true;
    map.set(r.emoji, cur);
  }
  return Array.from(map.entries()).map(([emoji, v]) => ({ emoji, ...v }));
}

export function isImageMime(mime: string | null): boolean {
  return !!mime && mime.startsWith('image/');
}

export function isPdfMime(mime: string | null): boolean {
  return mime === 'application/pdf';
}

export function formatBytes(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}