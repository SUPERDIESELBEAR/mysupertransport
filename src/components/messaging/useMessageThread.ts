import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { sanitizeText } from '@/lib/sanitize';
import { ChatMessage, MessageReaction, MESSAGE_SELECT, EDIT_WINDOW_MS } from './types';
import { toast } from '@/hooks/use-toast';

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIMES = new Set([
  'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'application/pdf',
]);

interface UseMessageThreadOpts {
  myUserId: string | null;
  otherUserId: string | null;
  /** Called once after the initial message load completes */
  onMessagesLoaded?: (msgs: ChatMessage[]) => void;
  /** Called when a new incoming message arrives (for thread-list updates) */
  onIncomingMessage?: (msg: ChatMessage) => void;
}

export function useMessageThread({
  myUserId, otherUserId, onMessagesLoaded, onIncomingMessage,
}: UseMessageThreadOpts) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reactions, setReactions] = useState<MessageReaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const typingChannelRef = useRef<RealtimeChannel | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentAt = useRef(0);

  // ── Load messages + reactions ─────────────────────────────────────────
  const load = useCallback(async () => {
    if (!myUserId || !otherUserId) return;
    setLoading(true);

    const { data: msgs } = await supabase
      .from('messages')
      .select(MESSAGE_SELECT)
      .or(
        `and(sender_id.eq.${myUserId},recipient_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},recipient_id.eq.${myUserId})`
      )
      .order('sent_at', { ascending: true });

    const list = (msgs ?? []) as ChatMessage[];
    setMessages(list);

    // Fetch reactions for these messages
    if (list.length > 0) {
      const ids = list.map(m => m.id);
      const { data: rx } = await supabase
        .from('message_reactions')
        .select('id, message_id, user_id, emoji, created_at')
        .in('message_id', ids);
      setReactions((rx ?? []) as MessageReaction[]);
    } else {
      setReactions([]);
    }

    setLoading(false);
    onMessagesLoaded?.(list);

    // Mark unread incoming as read
    const unreadIds = list.filter(m => m.sender_id === otherUserId && !m.read_at).map(m => m.id);
    if (unreadIds.length > 0) {
      await supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .in('id', unreadIds);
    }
  }, [myUserId, otherUserId, onMessagesLoaded]);

  useEffect(() => { void load(); }, [load]);

  // ── Realtime subscriptions ────────────────────────────────────────────
  useEffect(() => {
    if (!myUserId || !otherUserId) return;

    const sortKey = [myUserId, otherUserId].sort().join('-');

    const channel = supabase
      .channel(`thread-${sortKey}`)
      // Inbound INSERT
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `recipient_id=eq.${myUserId}`,
      }, async (payload) => {
        const msg = payload.new as ChatMessage;
        if (msg.sender_id !== otherUserId) {
          onIncomingMessage?.(msg);
          return;
        }
        setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
        // mark read
        await supabase.from('messages').update({ read_at: new Date().toISOString() }).eq('id', msg.id);
        onIncomingMessage?.(msg);
      })
      // Outbound INSERT (sent by me, e.g. from another device) — keep in sync
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `sender_id=eq.${myUserId}`,
      }, (payload) => {
        const msg = payload.new as ChatMessage;
        if (msg.recipient_id !== otherUserId) return;
        setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
      })
      // Any UPDATE on messages I'm involved with (read receipts, edits, deletes, pins)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'messages',
        filter: `sender_id=eq.${myUserId}`,
      }, (payload) => {
        const updated = payload.new as ChatMessage;
        setMessages(prev => prev.map(m => m.id === updated.id ? { ...m, ...updated } : m));
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'messages',
        filter: `recipient_id=eq.${myUserId}`,
      }, (payload) => {
        const updated = payload.new as ChatMessage;
        setMessages(prev => prev.map(m => m.id === updated.id ? { ...m, ...updated } : m));
      })
      // Reactions: insert/delete
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'message_reactions',
      }, (payload) => {
        const r = payload.new as MessageReaction;
        // Only keep reactions for messages currently in the thread
        setReactions(prev => {
          if (prev.some(x => x.id === r.id)) return prev;
          return [...prev, r];
        });
      })
      .on('postgres_changes', {
        event: 'DELETE', schema: 'public', table: 'message_reactions',
      }, (payload) => {
        const old = payload.old as Partial<MessageReaction>;
        setReactions(prev => prev.filter(r => r.id !== old.id));
      })
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [myUserId, otherUserId, onIncomingMessage]);

  // ── Typing presence (broadcast channel) ───────────────────────────────
  useEffect(() => {
    if (!myUserId || !otherUserId) return;
    const sortKey = [myUserId, otherUserId].sort().join('-');
    const ch = supabase.channel(`typing-${sortKey}`, {
      config: { broadcast: { self: false } },
    });
    ch.on('broadcast', { event: 'typing' }, (payload) => {
      const fromId = (payload.payload as { user_id?: string })?.user_id;
      if (fromId !== otherUserId) return;
      setOtherTyping(true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => setOtherTyping(false), 3500);
    }).on('broadcast', { event: 'stopped_typing' }, (payload) => {
      const fromId = (payload.payload as { user_id?: string })?.user_id;
      if (fromId !== otherUserId) return;
      setOtherTyping(false);
    }).subscribe();
    typingChannelRef.current = ch;
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      void supabase.removeChannel(ch);
      typingChannelRef.current = null;
    };
  }, [myUserId, otherUserId]);

  const notifyTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingSentAt.current < 1500) return; // throttle
    lastTypingSentAt.current = now;
    typingChannelRef.current?.send({
      type: 'broadcast', event: 'typing', payload: { user_id: myUserId },
    });
  }, [myUserId]);

  const notifyStoppedTyping = useCallback(() => {
    typingChannelRef.current?.send({
      type: 'broadcast', event: 'stopped_typing', payload: { user_id: myUserId },
    });
  }, [myUserId]);

  // ── Send (text + optional attachment + reply) ────────────────────────
  const send = useCallback(async (
    body: string,
    opts: { replyToId?: string | null; file?: File | null } = {},
  ): Promise<ChatMessage | null> => {
    if (!myUserId || !otherUserId) return null;
    const clean = sanitizeText(body.trim());
    if (!clean && !opts.file) return null;

    // Optional: upload attachment first
    let attachment_url: string | null = null;
    let attachment_name: string | null = null;
    let attachment_mime: string | null = null;
    let attachment_size_bytes: number | null = null;

    if (opts.file) {
      const f = opts.file;
      if (!ALLOWED_MIMES.has(f.type)) {
        toast({ title: 'Unsupported file type', description: 'Only PNG, JPG, WebP, GIF, or PDF allowed.', variant: 'destructive' });
        return null;
      }
      if (f.size > MAX_ATTACHMENT_BYTES) {
        toast({ title: 'File too large', description: 'Max 10 MB per attachment.', variant: 'destructive' });
        return null;
      }
      const ext = f.name.split('.').pop() ?? 'bin';
      const path = `${myUserId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('message-attachments')
        .upload(path, f, { contentType: f.type, upsert: false });
      if (upErr) {
        toast({ title: 'Upload failed', description: upErr.message, variant: 'destructive' });
        return null;
      }
      const { data: signed } = await supabase.storage
        .from('message-attachments')
        .createSignedUrl(path, 60 * 60 * 24 * 365); // 1-year signed URL
      attachment_url = signed?.signedUrl ?? null;
      attachment_name = f.name;
      attachment_mime = f.type;
      attachment_size_bytes = f.size;
    }

    const { data: inserted, error } = await supabase
      .from('messages')
      .insert({
        sender_id: myUserId,
        recipient_id: otherUserId,
        body: clean,
        reply_to_id: opts.replyToId ?? null,
        attachment_url, attachment_name, attachment_mime, attachment_size_bytes,
      })
      .select(MESSAGE_SELECT)
      .single();

    if (error || !inserted) {
      toast({ title: 'Could not send message', description: error?.message ?? 'Unknown error', variant: 'destructive' });
      return null;
    }

    const msg = inserted as ChatMessage;
    setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
    notifyStoppedTyping();
    return msg;
  }, [myUserId, otherUserId, notifyStoppedTyping]);

  // ── Edit (within 5 min) ───────────────────────────────────────────────
  const editMessage = useCallback(async (msg: ChatMessage, newBody: string) => {
    const clean = sanitizeText(newBody.trim());
    if (!clean || clean === msg.body) return;
    if (Date.now() - new Date(msg.sent_at).getTime() >= EDIT_WINDOW_MS) {
      toast({ title: 'Edit window expired', description: 'You can only edit within 5 minutes.', variant: 'destructive' });
      return;
    }
    const { error } = await supabase
      .from('messages')
      .update({ body: clean })
      .eq('id', msg.id);
    if (error) {
      toast({ title: 'Edit failed', description: error.message, variant: 'destructive' });
      return;
    }
    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, body: clean, edited_at: new Date().toISOString() } : m));
  }, []);

  // ── Soft delete ───────────────────────────────────────────────────────
  const deleteMessage = useCallback(async (msg: ChatMessage) => {
    const { error } = await supabase
      .from('messages')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', msg.id);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
      return;
    }
    setMessages(prev => prev.map(m =>
      m.id === msg.id
        ? { ...m, deleted_at: new Date().toISOString(), body: '', attachment_url: null, attachment_name: null, attachment_mime: null, attachment_size_bytes: null }
        : m
    ));
  }, []);

  // ── Pin / unpin (staff only — RLS will reject otherwise) ──────────────
  const togglePin = useCallback(async (msg: ChatMessage) => {
    const newVal = msg.pinned_at ? null : new Date().toISOString();
    const { error } = await supabase
      .from('messages')
      .update({ pinned_at: newVal })
      .eq('id', msg.id);
    if (error) {
      toast({ title: 'Could not change pin', description: error.message, variant: 'destructive' });
      return;
    }
    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, pinned_at: newVal } : m));
  }, []);

  // ── Toggle reaction (add or remove) ───────────────────────────────────
  const toggleReaction = useCallback(async (msg: ChatMessage, emoji: string) => {
    if (!myUserId) return;
    const existing = reactions.find(r => r.message_id === msg.id && r.user_id === myUserId && r.emoji === emoji);
    if (existing) {
      const { error } = await supabase.from('message_reactions').delete().eq('id', existing.id);
      if (error) {
        toast({ title: 'Could not remove reaction', description: error.message, variant: 'destructive' });
        return;
      }
      setReactions(prev => prev.filter(r => r.id !== existing.id));
    } else {
      const { data, error } = await supabase
        .from('message_reactions')
        .insert({ message_id: msg.id, user_id: myUserId, emoji })
        .select('id, message_id, user_id, emoji, created_at')
        .single();
      if (error || !data) {
        toast({ title: 'Could not add reaction', description: error?.message ?? 'Unknown error', variant: 'destructive' });
        return;
      }
      setReactions(prev => prev.some(r => r.id === data.id) ? prev : [...prev, data as MessageReaction]);
    }
  }, [myUserId, reactions]);

  return {
    messages, reactions, loading, otherTyping,
    send, editMessage, deleteMessage, togglePin, toggleReaction,
    notifyTyping, notifyStoppedTyping,
    setMessages, // exposed so parent can patch (e.g., resync after thread switch)
  };
}