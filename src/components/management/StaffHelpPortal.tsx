import { useState, useRef, useEffect, useCallback, KeyboardEvent } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LifeBuoy, Send, BookOpen, Loader2, ArrowRight, X, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import { searchHelp, getHelpEntryById, getSuggestionsForRole, type HelpEntry } from '@/lib/staffHelp';

interface Source { id: string; question: string; category: string }
interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
}

const MAX_CONTEXT_ENTRIES = 10;

export default function StaffHelpPortal() {
  const { activeRole } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const results = input.trim() ? searchHelp(input, activeRole) : [];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

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

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || sending) return;
    const nextMessages: ChatMsg[] = [...messages, { role: 'user', content }];
    setMessages(nextMessages);
    setInput('');
    setSending(true);
    setDropdownOpen(false);

    const contextEntries = input.trim() ? results.slice(0, MAX_CONTEXT_ENTRIES).map(r => r.entry) : [];

    try {
      const { data, error } = await supabase.functions.invoke('staff-help-chat', {
        body: {
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
      setMessages(prev => [...prev, { role: 'assistant', content: answer || '(no response)', sources }]);
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

  return (
    <div className="flex flex-col h-[calc(100dvh-8rem)] animate-fade-in" ref={containerRef}>
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
          <LifeBuoy className="h-6 w-6 text-gold shrink-0" />
          Staff Help
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Search for a page, feature, or workflow — then click <span className="font-medium text-foreground">Go</span> to
          jump there, or ask the AI for step-by-step instructions.
        </p>
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
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <BookOpen className="h-3 w-3" /> Sources:
                        </span>
                        {m.sources.map(s => (
                          <Badge
                            key={s.id}
                            variant="outline"
                            className="text-[11px] font-normal max-w-[280px] truncate"
                            title={s.question}
                          >
                            {s.question}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {sending && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
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
  );
}
