/**
 * Draft with AI — ask about a feature SUPERDRIVE has shipped and get a
 * staff-ready announcement back.
 *
 * The assistant never publishes. Each draft offers two choices: load it into
 * the composer for hand-editing, or save it straight to the pending queue for
 * the owner's approval. Approval stays exactly where it was.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { Loader2, Send, PenLine, Wand2, Inbox, ArrowRight } from 'lucide-react';
import { STAFF_HELP_INDEX } from '@/lib/staffHelp/help-index';
import {
  notesDb, STAFF_AUDIENCE_ROLES, AUDIENCE_LABELS, CATEGORY_LABELS,
  type ReleaseNoteCategory, type StaffAudienceRole,
} from '@/lib/releaseNotes/types';

export interface AiDraft {
  title: string;
  body: string;
  category: ReleaseNoteCategory;
  target_roles: StaffAudienceRole[];
  link_route: string;
}

interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
  draft?: AiDraft | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Hand a draft to the composer on the page behind the drawer. */
  onLoadDraft: (draft: AiDraft) => void;
  /** Called after a draft is saved straight to the pending queue. */
  onSaved: () => void;
}

const STARTERS = [
  'Draft an announcement for the absence log on the dispatch board',
  'Draft an announcement for the archived applicants tab',
  'What changed with staff account suspension?',
  'Write a reminder about the inspection binder for dispatchers',
];

const SCREENS = STAFF_HELP_INDEX
  .filter(e => !!e.route)
  .map(e => ({ route: e.route as string, title: e.title, breadcrumb: e.breadcrumb }));

export default function DraftWithAiDrawer({ open, onOpenChange, onLoadDraft, onSaved }: Props) {
  const { session, isOwner } = useAuth();
  const { toast } = useToast();
  const myId = session?.user?.id ?? null;

  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [savingIdx, setSavingIdx] = useState<number | null>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 120);
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns, thinking]);

  const screenTitle = useMemo(() => {
    const map: Record<string, string> = {};
    SCREENS.forEach(s => { map[s.route] = s.title; });
    return map;
  }, []);

  const ask = useCallback(async (text: string) => {
    const question = text.trim();
    if (!question || thinking) return;

    const history = [...turns, { role: 'user' as const, content: question }];
    setTurns(history);
    setInput('');
    setThinking(true);

    const { data, error } = await supabase.functions.invoke('draft-release-note-ai', {
      body: {
        messages: history.map(t => ({ role: t.role, content: t.content })),
        screens: SCREENS,
      },
    });
    setThinking(false);

    const failure = (error as { message?: string } | null)?.message
      ?? (data as { error?: string } | null)?.error;
    if (failure || !data) {
      toast({
        title: 'The assistant could not answer',
        description: failure ?? 'Please try again.',
        variant: 'destructive',
      });
      setTurns(prev => prev.slice(0, -1));
      setInput(question);
      return;
    }

    const reply = (data as { reply?: string }).reply?.trim() || 'I could not put that into words. Try asking again.';
    const raw = (data as { draft?: AiDraft | null }).draft ?? null;
    const draft: AiDraft | null = raw
      ? {
          ...raw,
          target_roles: (raw.target_roles ?? []).filter(
            (r): r is StaffAudienceRole => (STAFF_AUDIENCE_ROLES as readonly string[]).includes(r),
          ),
        }
      : null;

    setTurns(prev => [...prev, { role: 'assistant', content: reply, draft }]);
    setTimeout(() => inputRef.current?.focus(), 80);
  }, [turns, thinking, toast]);

  const saveToPending = async (draft: AiDraft, idx: number) => {
    setSavingIdx(idx);
    const nowIso = new Date().toISOString();
    const route = draft.link_route || null;
    const { error } = await notesDb.from('release_notes').insert({
      title: draft.title,
      body: draft.body,
      created_by: myId,
      flagged_faq_ids: [],
      category: draft.category,
      target_roles: draft.target_roles.length ? draft.target_roles : [...STAFF_AUDIENCE_ROLES],
      link_route: route,
      link_label: route ? `Open ${screenTitle[route] ?? 'screen'}` : null,
      requires_ack: false,
      is_pinned: false,
      // Always pending, for the owner and for management alike: an AI draft is
      // never published without somebody reading it first.
      status: 'pending',
      submitted_by: myId,
      submitted_at: nowIso,
    });
    setSavingIdx(null);
    if (error) {
      toast({ title: 'Could not save the draft', description: error.message, variant: 'destructive' });
      return;
    }
    toast({
      title: 'Saved for approval',
      description: isOwner
        ? 'It is waiting in Pending Your Approval — nothing has been sent.'
        : 'The owner will review it. Nothing is sent to staff until it is approved.',
    });
    onSaved();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col p-0 gap-0">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border text-left">
          <SheetTitle className="flex items-center gap-2 text-base">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-gold/15">
              <PenLine className="h-4 w-4 text-gold" />
            </span>
            Draft with AI
          </SheetTitle>
          <SheetDescription className="text-xs">
            Ask about anything built in SUPERDRIVE and get an announcement staff can read.
            Every draft waits for approval — nothing is sent from here.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {turns.length === 0 && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">Try one of these:</p>
              {STARTERS.map(s => (
                <button
                  key={s}
                  onClick={() => void ask(s)}
                  className="w-full text-left rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-xs hover:border-gold hover:bg-gold/5 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {turns.map((t, i) => (
            <div key={i} className={t.role === 'user' ? 'flex justify-end' : ''}>
              {t.role === 'user' ? (
                <div className="max-w-[85%] rounded-lg bg-primary px-3 py-2 text-xs text-primary-foreground whitespace-pre-wrap">
                  {t.content}
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{t.content}</p>

                  {t.draft && (
                    <div className="rounded-lg border border-gold/40 bg-gold/5 p-3 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-sm font-semibold text-foreground">{t.draft.title}</h4>
                        <Badge variant="secondary" className="text-[10px] shrink-0">
                          {CATEGORY_LABELS[t.draft.category] ?? t.draft.category}
                        </Badge>
                      </div>

                      <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                        {t.draft.body}
                      </p>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {(t.draft.target_roles.length ? t.draft.target_roles : [...STAFF_AUDIENCE_ROLES]).map(r => (
                          <Badge key={r} variant="outline" className="text-[10px]">
                            {AUDIENCE_LABELS[r] ?? r}
                          </Badge>
                        ))}
                        {t.draft.link_route && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                            <ArrowRight className="h-3 w-3" />
                            {screenTitle[t.draft.link_route] ?? t.draft.link_route}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-col sm:flex-row gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 text-xs"
                          onClick={() => {
                            onLoadDraft(t.draft!);
                            onOpenChange(false);
                            toast({ title: 'Loaded into the announcement form' });
                          }}
                        >
                          <Wand2 className="h-3.5 w-3.5 mr-1.5" />
                          Edit in the form
                        </Button>
                        <Button
                          size="sm"
                          className="flex-1 text-xs"
                          disabled={savingIdx === i}
                          onClick={() => void saveToPending(t.draft!, i)}
                        >
                          {savingIdx === i
                            ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                            : <Inbox className="h-3.5 w-3.5 mr-1.5" />}
                          Save for approval
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {thinking && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Writing…
            </p>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-border p-3">
          <div className="flex items-end gap-2">
            <Textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void ask(input);
                }
              }}
              placeholder="Ask about a feature, or say how to change the draft…"
              rows={2}
              className="resize-none text-xs"
              maxLength={1000}
            />
            <Button
              size="icon"
              className="h-9 w-9 shrink-0"
              disabled={thinking || !input.trim()}
              onClick={() => void ask(input)}
            >
              {thinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
