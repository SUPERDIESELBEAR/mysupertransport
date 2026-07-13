import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LifeBuoy, Send, BookOpen, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';

interface Source { id: string; question: string; category: string }
interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
}

const SUGGESTIONS = [
  'How do I revert an application?',
  'How do I send a PEI request?',
  'How do I add a new driver?',
  'Where do I edit the onboarding pipeline stages?',
  'How do I deactivate a fuel card?',
  'How do I open a driver’s inspection binder from Dispatch?',
];

export default function StaffHelpPortal() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || sending) return;
    const nextMessages: ChatMsg[] = [...messages, { role: 'user', content }];
    setMessages(nextMessages);
    setInput('');
    setSending(true);

    try {
      const { data, error } = await supabase.functions.invoke('staff-help-chat', {
        body: {
          messages: nextMessages.map(({ role, content }) => ({ role, content })),
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
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-8rem)] animate-fade-in">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
          <LifeBuoy className="h-6 w-6 text-gold shrink-0" />
          Staff Help
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Ask anything about using the SUPERDRIVE dashboard and driver app. Answers draw from
          published FAQs and general product knowledge.
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
            <p className="text-sm text-muted-foreground max-w-sm mb-6">
              I can walk you through workflows, sidebar features, and driver-app steps. Try one
              of these to start:
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
                      <ReactMarkdown>{m.content}</ReactMarkdown>
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

      {/* Composer */}
      <div className="mt-3 flex gap-2 items-end">
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={sending}
          placeholder="Ask how to do something in SUPERDRIVE…"
          rows={2}
          className="resize-none text-sm"
        />
        <Button
          onClick={() => send(input)}
          disabled={sending || !input.trim()}
          size="icon"
          className="h-11 w-11 shrink-0 bg-gold hover:bg-gold/90 text-surface-dark"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}