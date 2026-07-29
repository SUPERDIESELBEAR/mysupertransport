import { useState, useRef, useEffect, useCallback, useMemo, KeyboardEvent } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { LifeBuoy, Send, BookOpen, Loader2, ArrowRight, X, ExternalLink, Plus, Trash2, MessageSquare, Pin, PinOff, PanelLeftClose, PanelLeft } from 'lucide-react';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import { searchHelp, getHelpEntryById, getSuggestionsForRole, type HelpEntry } from '@/lib/staffHelp';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Source { id: string; question: string; category: string; route?: string }
interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  followUps?: string[];
}
interface Thread {
  id: string;
  title: string;
  pinned: boolean;
  updated_at: string;
}

const MAX_CONTEXT_ENTRIES = 10;

export default function StaffHelpPortal() {
  const { activeRole, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const threadIdParam = searchParams.get('thread');

  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(threadIdParam);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<Thread | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const results = input.trim() ? searchHelp(input, activeRole) : [];

  // Load threads for the current user.
  const loadThreads = useCallback(async () => {
    if (!user) return;
    setThreadsLoading(true);
    const { data, error } = await supabase
      .from('staff_help_threads')
      .select('id, title, pinned, updated_at')
      .eq('user_id', user.id)
      .order('pinned', { ascending: false })
      .order('updated_at', { ascending: false });
    if (error) {
      console.error('load threads', error);
    } else {
      setThreads((data ?? []) as Thread[]);
    }
    setThreadsLoading(false);
  }, [user]);

  useEffect(() => { loadThreads(); }, [loadThreads]);

  // Load messages for the active thread.
  useEffect(() => {
    if (!activeThreadId) { setMessages([]); return; }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('staff_help_messages')
        .select('role, content, sources, follow_ups')
        .eq('thread_id', activeThreadId)
        .order('created_at', { ascending: true });
      if (cancelled) return;
      if (error) {
        console.error('load messages', error);
        return;
      }
      setMessages((data ?? []).map((m: any) => ({
        role: m.role,
        content: m.content,
        sources: Array.isArray(m.sources) ? m.sources : undefined,
        followUps: Array.isArray(m.follow_ups) ? m.follow_ups : undefined,
      })));
    })();
    return () => { cancelled = true; };
  }, [activeThreadId]);

  // Keep URL and active thread in sync.
  useEffect(() => {
    if (threadIdParam && threadIdParam !== activeThreadId) {
      setActiveThreadId(threadIdParam);
    }
  }, [threadIdParam, activeThreadId]);

  const openThread = useCallback((id: string | null) => {
    setActiveThreadId(id);
    const next = new URLSearchParams(searchParams);
    if (id) next.set('thread', id); else next.delete('thread');
    setSearchParams(next, { replace: true });
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, [searchParams, setSearchParams]);

  const newChat = useCallback(() => {
    setMessages([]);
    setInput('');
    openThread(null);
  }, [openThread]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [activeThreadId]);

  useEffect(() => {
    setActiveIndex(0);
  }, [input]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const navigateTo = useCallback((route: string) => {
    try { sessionStorage.removeItem('mgmt_last_view'); } catch { /* ignore */ }
    setDropdownOpen(false);
    if (route.startsWith('http') || route.startsWith('/operator')) {
      window.open(route, '_blank', 'noopener,noreferrer');
    } else {
      navigate(route);
    }
  }, [navigate]);

  async function ensureThread(firstUserText: string): Promise<string | null> {
    if (activeThreadId) return activeThreadId;
    if (!user) return null;
    const title = firstUserText.trim().slice(0, 60) || 'New chat';
    const { data, error } = await supabase
      .from('staff_help_threads')
      .insert({ user_id: user.id, title })
      .select('id, title, pinned, updated_at')
      .single();
    if (error || !data) {
      console.error('create thread', error);
      toast.error('Could not start a new chat.');
      return null;
    }
    setThreads(prev => [data as Thread, ...prev]);
    setActiveThreadId(data.id);
    const next = new URLSearchParams(searchParams);
    next.set('thread', data.id);
    setSearchParams(next, { replace: true });
    return data.id;
  }

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || sending) return;
    if (!user) return;

    const threadId = await ensureThread(content);
    if (!threadId) return;

    const nextMessages: ChatMsg[] = [...messages, { role: 'user', content }];
    setMessages(nextMessages);
    setInput('');
    setSending(true);
    setDropdownOpen(false);

    const contextEntries = input.trim() ? results.slice(0, MAX_CONTEXT_ENTRIES).map(r => r.entry) : [];

    // Persist the user message.
    await supabase.from('staff_help_messages').insert({
      thread_id: threadId,
      user_id: user.id,
      role: 'user',
      content,
    });

    try {
      const { data, error } = await supabase.functions.invoke('staff-help-chat', {
        body: {
          threadId,
          messages: nextMessages.map(({ role, content }) => ({ role, content })),
          contextEntries: contextEntries.map(e => ({
            id: e.id,
            title: e.title,
            page: e.page,
            route: e.route,
            breadcrumb: e.breadcrumb,
            steps: e.steps,
            keywords: e.keywords,
            surface: e.surface,
          })),
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const answer = (data as any)?.answer as string;
      const sources = ((data as any)?.sources ?? []) as Source[];
      const followUps = ((data as any)?.followUps ?? []) as string[];
      setMessages(prev => [...prev, { role: 'assistant', content: answer || '(no response)', sources, followUps }]);
      await supabase.from('staff_help_messages').insert({
        thread_id: threadId,
        user_id: user.id,
        role: 'assistant',
        content: answer || '(no response)',
        sources: sources as any,
        follow_ups: followUps,
      });
      // Auto-title thread if still default.
      const t = threads.find(x => x.id === threadId);
      if (t && (t.title === 'New chat' || t.title === content.slice(0, 60))) {
        const newTitle = content.trim().slice(0, 50);
        if (newTitle && newTitle !== t.title) {
          await supabase.from('staff_help_threads').update({ title: newTitle }).eq('id', threadId);
          setThreads(prev => prev.map(x => x.id === threadId ? { ...x, title: newTitle } : x));
        }
      }
    } catch (err: any) {
      console.error('staff-help-chat failed', err);
      const msg = err?.message?.includes('rate') ? 'The assistant is busy. Please retry in a moment.'
        : err?.message?.includes('credits') ? 'AI credits are exhausted. Add credits in workspace billing.'
        : 'Assistant unavailable. Please try again.';
      toast.error(msg);
      setMessages(prev => [...prev, { role: 'assistant', content: `_${msg}_` }]);
    } finally {
      setSending(false);
      setTimeout(() => textareaRef.current?.focus(), 0);
      loadThreads();
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!dropdownOpen) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send(input);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const entry = results[activeIndex]?.entry;
      if (entry) {
        navigateTo(entry.route);
      } else {
        send(input);
      }
    } else if (e.key === 'Escape') {
      setDropdownOpen(false);
    } else if (e.key === 'Tab') {
      setDropdownOpen(false);
    }
  };

  const SUGGESTIONS = getSuggestionsForRole(activeRole);

  // Group threads by recency for the sidebar.
  const grouped = useMemo(() => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const buckets: Record<string, Thread[]> = { Pinned: [], Today: [], Yesterday: [], 'Last 7 days': [], Older: [] };
    for (const t of threads) {
      if (t.pinned) { buckets.Pinned.push(t); continue; }
      const age = now - new Date(t.updated_at).getTime();
      if (age < day) buckets.Today.push(t);
      else if (age < 2 * day) buckets.Yesterday.push(t);
      else if (age < 7 * day) buckets['Last 7 days'].push(t);
      else buckets.Older.push(t);
    }
    return buckets;
  }, [threads]);

  async function togglePin(t: Thread) {
    const next = !t.pinned;
    setThreads(prev => prev.map(x => x.id === t.id ? { ...x, pinned: next } : x));
    const { error } = await supabase.from('staff_help_threads').update({ pinned: next }).eq('id', t.id);
    if (error) { toast.error('Could not update pin.'); loadThreads(); }
  }

  async function saveRename() {
    if (!renaming) return;
    const title = renaming.value.trim().slice(0, 80) || 'New chat';
    const id = renaming.id;
    setThreads(prev => prev.map(x => x.id === id ? { ...x, title } : x));
    setRenaming(null);
    const { error } = await supabase.from('staff_help_threads').update({ title }).eq('id', id);
    if (error) { toast.error('Could not rename.'); loadThreads(); }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setPendingDelete(null);
    setThreads(prev => prev.filter(x => x.id !== id));
    if (activeThreadId === id) openThread(null);
    const { error } = await supabase.from('staff_help_threads').delete().eq('id', id);
    if (error) { toast.error('Could not delete chat.'); loadThreads(); }
  }

  return (
    <div className="flex h-[calc(100dvh-8rem)] gap-3 animate-fade-in" ref={containerRef}>
      {/* Threads sidebar */}
      {sidebarOpen && (
        <aside className="w-64 shrink-0 flex flex-col rounded-xl border border-border bg-white overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Chats</span>
            <button
              onClick={() => setSidebarOpen(false)}
              className="text-muted-foreground hover:text-foreground p-1 rounded"
              aria-label="Hide chats"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>
          <button
            onClick={newChat}
            className="mx-3 mt-3 mb-2 flex items-center justify-center gap-1.5 rounded-lg bg-gold hover:bg-gold/90 text-surface-dark text-sm font-medium py-2 transition-colors"
          >
            <Plus className="h-4 w-4" /> New chat
          </button>
          <div className="flex-1 overflow-y-auto px-2 pb-3">
            {threadsLoading ? (
              <div className="flex items-center justify-center py-6 text-muted-foreground text-xs">
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Loading…
              </div>
            ) : threads.length === 0 ? (
              <div className="px-2 py-6 text-center text-xs text-muted-foreground">
                No chats yet. Ask a question below to start.
              </div>
            ) : (
              Object.entries(grouped).map(([label, list]) =>
                list.length === 0 ? null : (
                  <div key={label} className="mb-3">
                    <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                      {label}
                    </div>
                    <ul className="space-y-0.5">
                      {list.map(t => {
                        const active = t.id === activeThreadId;
                        const isRenaming = renaming?.id === t.id;
                        return (
                          <li key={t.id}>
                            <div
                              className={`group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm transition-colors ${
                                active ? 'bg-gold/15 text-foreground' : 'hover:bg-muted/60 text-foreground'
                              }`}
                            >
                              <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              {isRenaming ? (
                                <input
                                  autoFocus
                                  value={renaming!.value}
                                  onChange={e => setRenaming({ id: t.id, value: e.target.value })}
                                  onBlur={saveRename}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') { e.preventDefault(); saveRename(); }
                                    if (e.key === 'Escape') setRenaming(null);
                                  }}
                                  className="flex-1 min-w-0 bg-transparent border-b border-gold outline-none text-sm"
                                />
                              ) : (
                                <button
                                  onClick={() => openThread(t.id)}
                                  onDoubleClick={() => setRenaming({ id: t.id, value: t.title })}
                                  className="flex-1 min-w-0 text-left truncate"
                                  title={t.title}
                                >
                                  {t.title}
                                </button>
                              )}
                              <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                                <button
                                  onClick={() => togglePin(t)}
                                  className="text-muted-foreground hover:text-foreground p-0.5 rounded"
                                  aria-label={t.pinned ? 'Unpin' : 'Pin'}
                                  title={t.pinned ? 'Unpin' : 'Pin'}
                                >
                                  {t.pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                                </button>
                                <button
                                  onClick={() => setPendingDelete(t)}
                                  className="text-muted-foreground hover:text-red-600 p-0.5 rounded"
                                  aria-label="Delete chat"
                                  title="Delete chat"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                              {t.pinned && !isRenaming && (
                                <Pin className="h-3 w-3 text-gold shrink-0 group-hover:hidden" />
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )
              )
            )}
          </div>
        </aside>
      )}

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="mb-3 flex items-start gap-2">
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="mt-1 p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
              aria-label="Show chats"
            >
              <PanelLeft className="h-4 w-4" />
            </button>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
              <LifeBuoy className="h-6 w-6 text-gold shrink-0" />
              Staff Help
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Ask any question about SUPERDRIVE. Chats are saved to your account — click a past chat on the left to continue it.
            </p>
          </div>
        </div>

      {/* Transcript */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto rounded-xl border border-border bg-muted/20 p-4"
      >
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-4">
            <div className="h-14 w-14 rounded-full bg-gold/15 flex items-center justify-center mb-4">
              <LifeBuoy className="h-7 w-7 text-gold" />
            </div>
            <p className="text-sm text-muted-foreground max-w-sm mb-2">
              Type a keyword to search the complete SUPERDRIVE index, or ask a question for
              step-by-step help.
            </p>
            <p className="text-xs text-muted-foreground mb-6">
              Examples: <span className="font-medium">Pipeline</span>, <span className="font-medium">decal photos</span>,{' '}
              <span className="font-medium">deactivate driver</span>
            </p>
            <div className="flex flex-wrap gap-2 justify-center max-w-2xl">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  disabled={sending}
                  className="text-xs px-3 py-2 rounded-full border border-border bg-white hover:border-gold/60 hover:bg-gold/5 text-foreground transition-colors disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : ''}>
                {m.role === 'user' ? (
                  <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-surface-dark text-white px-4 py-2 text-sm whitespace-pre-wrap">
                    {m.content}
                  </div>
                ) : (
                  <div className="max-w-[95%]">
                    <div className="prose prose-sm max-w-none text-foreground prose-headings:text-foreground prose-strong:text-foreground prose-a:text-gold prose-code:text-foreground prose-code:bg-muted prose-code:px-1 prose-code:rounded">
                      <ReactMarkdown
                        components={{
                          a: ({ node, href, children, ...props }) => {
                            if (href?.startsWith('go:')) {
                              const entryId = href.slice(3);
                              const entry = getHelpEntryById(entryId);
                              return (
                                <button
                                  onClick={() => entry && navigateTo(entry.route)}
                                  className="inline-flex items-center gap-1 text-gold hover:underline font-medium"
                                >
                                  {children} <ArrowRight className="h-3 w-3" />
                                </button>
                              );
                            }
                            return (
                              <a href={href} target="_blank" rel="noopener noreferrer" className="text-gold hover:underline" {...props}>
                                {children}
                              </a>
                            );
                          },
                        }}
                      >
                        {m.content}
                      </ReactMarkdown>
                    </div>
                    {m.sources && m.sources.length > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <BookOpen className="h-3 w-3" /> Sources:
                        </span>
                        {m.sources.map(s => {
                          const entry = s.route ? getHelpEntryById(s.id) : undefined;
                          return (
                            <button
                              key={s.id}
                              onClick={() => entry && navigateTo(entry.route)}
                              disabled={!entry}
                              className="inline-flex items-start gap-1 text-[11px] px-2 py-1 rounded-lg border border-border bg-white hover:border-gold/60 hover:bg-gold/5 text-foreground transition-colors disabled:opacity-60 text-left whitespace-normal leading-snug"
                              title={entry ? `Go to ${s.question}` : s.question}
                            >
                              <span className="break-words">{s.question}</span>
                              {entry && <ArrowRight className="h-3 w-3 text-gold shrink-0 mt-0.5" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {m.followUps && m.followUps.length > 0 && i === messages.length - 1 && !sending && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {m.followUps.map((q, qi) => (
                          <button
                            key={qi}
                            onClick={() => send(q)}
                            className="text-xs px-3 py-1.5 rounded-full border border-gold/40 bg-gold/5 hover:bg-gold/15 text-foreground transition-colors"
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {sending && (
              <div className="flex">
                <div className="max-w-[95%] rounded-2xl rounded-tl-sm bg-white border border-border px-4 py-2.5 flex items-center gap-2">
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 bg-muted-foreground/70 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="h-1.5 w-1.5 bg-muted-foreground/70 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="h-1.5 w-1.5 bg-muted-foreground/70 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                  <span className="text-xs italic text-muted-foreground">SUPERDRIVE is thinking…</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Composer + typeahead */}
      <div className="mt-3 relative">
        <div className="flex gap-2 items-end">
          <div className="relative flex-1">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={e => {
                setInput(e.target.value);
                setDropdownOpen(e.target.value.trim().length > 0);
              }}
              onFocus={() => {
                if (input.trim()) setDropdownOpen(true);
              }}
              onKeyDown={onKeyDown}
              disabled={sending}
              placeholder="Search pages and features, or ask a question…"
              rows={2}
              className="resize-none text-sm pr-10"
            />
            {input.trim() && (
              <button
                onClick={() => { setInput(''); setDropdownOpen(false); textareaRef.current?.focus(); }}
                className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Button
            onClick={() => send(input)}
            disabled={sending || !input.trim()}
            size="icon"
            className="h-11 w-11 shrink-0 bg-gold hover:bg-gold/90 text-surface-dark"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>

        {dropdownOpen && results.length > 0 && (
          <div
            onMouseDown={e => e.stopPropagation()}
            className="absolute left-0 right-0 bottom-[calc(100%+0.5rem)] z-50 rounded-xl border border-border bg-white shadow-lg max-h-[min(24rem,50dvh)] overflow-y-auto"
          >
            <div className="px-3 py-2 text-[11px] text-muted-foreground border-b border-border bg-muted/30">
              Search results — press Enter to go to selection, or type a question for the AI
            </div>
            <ul role="listbox" className="py-1">
              {results.map((r, idx) => {
                const active = idx === activeIndex;
                return (
                  <li key={r.entry.id}>
                    <button
                      role="option"
                      aria-selected={active}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => navigateTo(r.entry.route)}
                      className={`w-full text-left px-3 py-2 flex items-start justify-between gap-3 transition-colors ${
                        active ? 'bg-gold/10' : 'hover:bg-muted/50'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-foreground truncate">
                          {r.entry.title}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {r.entry.breadcrumb}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                        {r.entry.surface === 'driver-pwa' && (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                            <ExternalLink className="h-3 w-3" /> driver
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 text-[11px] text-gold font-medium">
                          Go <ArrowRight className="h-3 w-3" />
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
      </div>

      <AlertDialog open={!!pendingDelete} onOpenChange={(v) => !v && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
            <AlertDialogDescription>
              "{pendingDelete?.title}" and all its messages will be permanently removed. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
