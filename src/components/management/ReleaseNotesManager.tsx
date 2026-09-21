/**
 * What's New — compose, review, publish.
 *
 * An announcement written by management saves as PENDING and sends nothing.
 * The owner reviews it and either approves it (which is the moment the bell
 * notifications and the email go out), denies it with a reason so the writer can
 * fix it, or archives it — shelved, never sent, kept for the record.
 *
 * The owner can also post directly, which skips the queue.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Megaphone, Send, Loader2, Trash2, AlertTriangle, X, Check, Ban, Archive, Eye, ChevronDown, Pencil,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { STAFF_HELP_INDEX } from '@/lib/staffHelp/help-index';
import {
  notesDb, RELEASE_NOTE_COLUMNS, STAFF_AUDIENCE_ROLES, AUDIENCE_LABELS,
  CATEGORY_LABELS, STATUS_LABELS,
  type ReleaseNote, type ReleaseNoteCategory, type StaffAudienceRole,
} from '@/lib/releaseNotes/types';

interface StaffFaqOption {
  id: string;
  question: string;
  category: string;
}

type ReadRow = { release_note_id: string; user_id: string; seen_at: string; acknowledged_at: string | null };

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-status-progress/15 text-status-progress border-status-progress/30',
  approved: 'bg-status-complete/15 text-status-complete border-status-complete/30',
  denied: 'bg-destructive/15 text-destructive border-destructive/30',
  archived: 'bg-muted text-muted-foreground border-border',
  draft: 'bg-muted text-muted-foreground border-border',
};

const SCREEN_OPTIONS = STAFF_HELP_INDEX
  .filter(e => !!e.route)
  .map(e => ({ route: e.route as string, title: e.title, breadcrumb: e.breadcrumb }))
  .sort((a, b) => a.title.localeCompare(b.title));

export default function ReleaseNotesManager() {
  const { session, isOwner } = useAuth();
  const { toast } = useToast();
  const myId = session?.user?.id ?? null;

  const [notes, setNotes] = useState<ReleaseNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [acting, setActing] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<ReleaseNoteCategory>('feature');
  const [audience, setAudience] = useState<StaffAudienceRole[]>([...STAFF_AUDIENCE_ROLES]);
  const [linkRoute, setLinkRoute] = useState<string>('none');
  const [requiresAck, setRequiresAck] = useState(false);
  const [isPinned, setIsPinned] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [denyId, setDenyId] = useState<string | null>(null);
  const [denyReason, setDenyReason] = useState('');
  const [expandedReads, setExpandedReads] = useState<string | null>(null);

  const [staffFaqs, setStaffFaqs] = useState<StaffFaqOption[]>([]);
  const [flagSearch, setFlagSearch] = useState('');
  const [flaggedIds, setFlaggedIds] = useState<string[]>([]);

  const [reads, setReads] = useState<ReadRow[]>([]);
  const [staffByRole, setStaffByRole] = useState<Record<string, string[]>>({});
  const [names, setNames] = useState<Record<string, string>>({});

  const fetchNotes = useCallback(async () => {
    const { data, error } = await notesDb
      .from('release_notes')
      .select(RELEASE_NOTE_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(80);
    if (error) {
      toast({ title: 'Could not load announcements', description: error.message, variant: 'destructive' });
    }
    setNotes((data as ReleaseNote[]) ?? []);
    setLoading(false);
  }, [toast]);

  const fetchReads = useCallback(async () => {
    const { data } = await notesDb
      .from('release_note_reads')
      .select('release_note_id, user_id, seen_at, acknowledged_at');
    setReads((data as ReadRow[]) ?? []);
  }, []);

  useEffect(() => { void fetchNotes(); void fetchReads(); }, [fetchNotes, fetchReads]);

  // Who counts as the audience, so "seen by N of M" means something.
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('role', [...STAFF_AUDIENCE_ROLES]);
      const map: Record<string, string[]> = {};
      (data ?? []).forEach(r => {
        map[r.role] = [...(map[r.role] ?? []), r.user_id];
      });
      setStaffByRole(map);

      const ids = Array.from(new Set((data ?? []).map(r => r.user_id)));
      if (ids.length) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('user_id, first_name, last_name')
          .in('user_id', ids);
        const n: Record<string, string> = {};
        (profs ?? []).forEach(p => {
          n[p.user_id] = [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Staff member';
        });
        setNames(n);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('faq')
        .select('id, question, category')
        .eq('audience', 'staff')
        .eq('is_published', true)
        .order('question');
      setStaffFaqs((data as StaffFaqOption[]) ?? []);
    })();
  }, []);

  const audienceUserIds = useCallback((roles: string[]) => {
    const set = new Set<string>();
    (roles.length ? roles : [...STAFF_AUDIENCE_ROLES]).forEach(r => {
      (staffByRole[r] ?? []).forEach(u => set.add(u));
    });
    return set;
  }, [staffByRole]);

  const resetComposer = () => {
    setTitle(''); setBody(''); setCategory('feature');
    setAudience([...STAFF_AUDIENCE_ROLES]);
    setLinkRoute('none'); setRequiresAck(false); setIsPinned(false);
    setFlaggedIds([]); setFlagSearch('');
    setEditingId(null);
  };

  // Load a pending draft into the composer so it can be corrected before the
  // owner approves it. Saving an edit updates the same row — it stays pending
  // until the owner approves it (or uses Save & Approve).
  const startEdit = (n: ReleaseNote) => {
    setEditingId(n.id);
    setTitle(n.title);
    setBody(n.body);
    setCategory(n.category);
    setAudience(
      (n.target_roles?.length ? n.target_roles : [...STAFF_AUDIENCE_ROLES])
        .filter((r): r is StaffAudienceRole => (STAFF_AUDIENCE_ROLES as readonly string[]).includes(r)),
    );
    setLinkRoute(n.link_route ?? 'none');
    setRequiresAck(n.requires_ack);
    setIsPinned(n.is_pinned);
    setFlaggedIds(n.flagged_faq_ids ?? []);
    setFlagSearch('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async () => {
    if (!title.trim() || !body.trim()) {
      toast({ title: 'Title and body are required', variant: 'destructive' });
      return;
    }
    if (audience.length === 0) {
      toast({ title: 'Choose at least one group to send this to', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const chosen = SCREEN_OPTIONS.find(s => s.route === linkRoute);
    const nowIso = new Date().toISOString();

    // Editing an existing pending draft: update the same row. It stays pending
    // unless the caller also approves it (owner only — see saveEdit below).
    if (editingId) {
      const { error } = await notesDb
        .from('release_notes')
        .update({
          title: title.trim(),
          body: body.trim(),
          flagged_faq_ids: flaggedIds,
          category,
          target_roles: audience,
          link_route: chosen?.route ?? null,
          link_label: chosen ? `Open ${chosen.title}` : null,
          requires_ack: requiresAck,
          is_pinned: isPinned,
        })
        .eq('id', editingId);
      setSaving(false);
      if (error) {
        toast({ title: 'Could not save the changes', description: error.message, variant: 'destructive' });
        return;
      }
      toast({ title: 'Draft updated', description: 'It is still waiting for approval — nothing has been sent.' });
      resetComposer();
      void fetchNotes();
      return;
    }

    const { error } = await notesDb.from('release_notes').insert({
      title: title.trim(),
      body: body.trim(),
      created_by: myId,
      flagged_faq_ids: flaggedIds,
      category,
      target_roles: audience,
      link_route: chosen?.route ?? null,
      link_label: chosen ? `Open ${chosen.title}` : null,
      requires_ack: requiresAck,
      is_pinned: isPinned,
      // The owner publishes directly; everyone else waits for his decision.
      status: isOwner ? 'approved' : 'pending',
      submitted_by: myId,
      submitted_at: nowIso,
      ...(isOwner ? { reviewed_by: myId, reviewed_at: nowIso, published_at: nowIso } : {}),
    });
    setSaving(false);
    if (error) {
      toast({ title: 'Could not save the announcement', description: error.message, variant: 'destructive' });
      return;
    }
    toast({
      title: isOwner ? 'Announcement published' : 'Sent for approval',
      description: isOwner
        ? 'The chosen staff groups have been notified by bell and email.'
        : 'Marcus will review it. Nothing is sent to staff until he approves it.',
    });
    resetComposer();
    void fetchNotes();
  };

  // Owner-only: apply the composer's edits to the pending draft, then release
  // it in the same click. The review gate still stamps reviewed_by/at.
  const saveEditThenApprove = async () => {
    if (!editingId || !title.trim() || !body.trim()) return;
    setSaving(true);
    const chosen = SCREEN_OPTIONS.find(s => s.route === linkRoute);
    const { error } = await notesDb
      .from('release_notes')
      .update({
        title: title.trim(),
        body: body.trim(),
        flagged_faq_ids: flaggedIds,
        category,
        target_roles: audience,
        link_route: chosen?.route ?? null,
        link_label: chosen ? `Open ${chosen.title}` : null,
        requires_ack: requiresAck,
        is_pinned: isPinned,
      })
      .eq('id', editingId);
    setSaving(false);
    if (error) {
      toast({ title: 'Could not save the changes', description: error.message, variant: 'destructive' });
      return;
    }
    const id = editingId;
    resetComposer();
    void review(id, 'approved');
  };

  const review = async (id: string, status: 'approved' | 'archived' | 'denied', reason?: string) => {
    setActing(id);
    const { error } = await notesDb
      .from('release_notes')
      .update({ status, denial_reason: status === 'denied' ? (reason ?? null) : null })
      .eq('id', id);
    setActing(null);
    if (error) {
      toast({ title: 'Not applied', description: error.message, variant: 'destructive' });
      return;
    }
    toast({
      title: status === 'approved' ? 'Approved and sent'
        : status === 'denied' ? 'Sent back to the writer'
        : 'Archived — never sent',
    });
    void fetchNotes();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await notesDb.from('release_notes').delete().eq('id', deleteId);
    setDeleteId(null);
    if (error) {
      toast({ title: 'Could not delete', description: error.message, variant: 'destructive' });
      return;
    }
    void fetchNotes();
    toast({ title: 'Announcement deleted' });
  };

  const pending = useMemo(() => notes.filter(n => n.status === 'pending' || n.status === 'draft'), [notes]);
  const denied = useMemo(() => notes.filter(n => n.status === 'denied'), [notes]);
  const published = useMemo(() => notes.filter(n => n.status === 'approved'), [notes]);
  const archived = useMemo(() => notes.filter(n => n.status === 'archived'), [notes]);

  const AudienceBadges = ({ roles }: { roles: string[] }) => (
    <div className="flex flex-wrap gap-1">
      {(roles.length ? roles : [...STAFF_AUDIENCE_ROLES]).map(r => (
        <Badge key={r} variant="secondary" className="text-[10px]">
          {AUDIENCE_LABELS[r as StaffAudienceRole] ?? r}
        </Badge>
      ))}
    </div>
  );

  const SeenBy = ({ note }: { note: ReleaseNote }) => {
    const audienceIds = audienceUserIds(note.target_roles ?? []);
    const seen = reads.filter(r => r.release_note_id === note.id && audienceIds.has(r.user_id));
    const open = expandedReads === note.id;
    return (
      <div className="mt-2">
        <button
          onClick={() => setExpandedReads(open ? null : note.id)}
          className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <Eye className="h-3.5 w-3.5" />
          Seen by {seen.length} of {audienceIds.size}
          <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && (
          <div className="mt-2 rounded border border-border bg-muted/30 p-2 space-y-1">
            {seen.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">Nobody has opened this yet.</p>
            ) : seen.map(r => (
              <p key={r.user_id} className="text-[11px] text-muted-foreground">
                {names[r.user_id] ?? 'Staff member'}
                {r.acknowledged_at ? ' — confirmed' : ''}
              </p>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Compose */}
      <Card className="border-gold/30">
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Megaphone className="h-5 w-5 text-gold" />
            <h3 className="font-semibold text-base">
              {editingId ? 'Edit Pending Announcement' : isOwner ? 'Post a New Announcement' : 'Write an Announcement'}
            </h3>
          </div>
          <p className="text-xs text-muted-foreground">
            {isOwner
              ? 'The groups you choose receive an in-app notification and an email the moment you post.'
              : 'Nothing is sent until Marcus approves it. He can also send it back with a note or shelve it.'}
          </p>

          <Input
            placeholder="Announcement title — e.g. 'In-App Document Preview'"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
          />
          <Textarea
            placeholder="Describe what changed and why it matters…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            maxLength={2000}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Type</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as ReleaseNoteCategory)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(CATEGORY_LABELS) as ReleaseNoteCategory[]).map(c => (
                    <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Screen this is about (optional)</Label>
              <Select value={linkRoute} onValueChange={setLinkRoute}>
                <SelectTrigger className="h-9"><SelectValue placeholder="No link" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="none">No link</SelectItem>
                  {SCREEN_OPTIONS.map(s => (
                    <SelectItem key={s.route} value={s.route}>
                      {s.title}{s.breadcrumb ? ` — ${s.breadcrumb}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
            <span className="text-xs font-semibold text-foreground">Who sees this</span>
            <p className="text-[11px] text-muted-foreground">Staff only — drivers never receive announcements.</p>
            <div className="flex flex-wrap gap-3 pt-1">
              {STAFF_AUDIENCE_ROLES.map(r => (
                <label key={r} className="flex items-center gap-2 text-xs cursor-pointer">
                  <Checkbox
                    checked={audience.includes(r)}
                    onCheckedChange={(v) =>
                      setAudience(prev => v ? [...prev, r] : prev.filter(x => x !== r))
                    }
                  />
                  {AUDIENCE_LABELS[r]}
                </label>
              ))}
            </div>
            <div className="flex flex-wrap gap-6 pt-2">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <Switch checked={requiresAck} onCheckedChange={setRequiresAck} />
                Needs a "Got it" from each person
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <Switch checked={isPinned} onCheckedChange={setIsPinned} />
                Pin to the top
              </label>
            </div>
          </div>

          {/* Flag staff FAQs for re-verification */}
          {staffFaqs.length > 0 && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-orange-600" />
                <span className="text-xs font-semibold text-foreground">
                  Flag Staff Help articles that need re-verification
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Optional. Selected articles will be marked stale so content owners re-review them.
              </p>

              {flaggedIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {flaggedIds.map(id => {
                    const f = staffFaqs.find(s => s.id === id);
                    if (!f) return null;
                    return (
                      <Badge key={id} variant="secondary" className="gap-1 max-w-full">
                        <span className="truncate max-w-[220px]">{f.question}</span>
                        <button
                          onClick={() => setFlaggedIds(prev => prev.filter(x => x !== id))}
                          className="hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              )}

              <Input
                value={flagSearch}
                onChange={e => setFlagSearch(e.target.value)}
                placeholder="Search staff FAQs to flag…"
                className="h-8 text-xs"
              />
              {flagSearch.trim() && (
                <div className="max-h-40 overflow-y-auto rounded border border-border bg-white divide-y divide-border">
                  {staffFaqs
                    .filter(f =>
                      !flaggedIds.includes(f.id) &&
                      f.question.toLowerCase().includes(flagSearch.toLowerCase())
                    )
                    .slice(0, 8)
                    .map(f => (
                      <button
                        key={f.id}
                        onClick={() => {
                          setFlaggedIds(prev => [...prev, f.id]);
                          setFlagSearch('');
                        }}
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors"
                      >
                        {f.question}
                      </button>
                    ))}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            {editingId && (
              <Button variant="outline" onClick={resetComposer} disabled={saving}>
                Cancel edit
              </Button>
            )}
            <Button onClick={handleSubmit} disabled={saving || !title.trim() || !body.trim()} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {saving ? 'Saving…' : editingId ? 'Save Changes' : isOwner ? 'Post Announcement' : 'Submit for Approval'}
            </Button>
            {editingId && isOwner && (
              <Button
                onClick={() => void saveEditThenApprove()}
                disabled={saving || !title.trim() || !body.trim()}
                className="gap-2"
              >
                <Check className="h-4 w-4" /> Save &amp; Approve
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Pending approval */}
      {pending.length > 0 && (
        <div>
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-3">
            {isOwner ? `Pending Your Approval (${pending.length})` : `Waiting for Approval (${pending.length})`}
          </h3>
          <div className="space-y-3">
            {pending.map(n => (
              <Card key={n.id} className="border-gold/40">
                <CardContent className="py-4 px-5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-semibold text-sm">{n.title}</h4>
                        <Badge variant="outline" className={`text-[10px] ${STATUS_BADGE[n.status]}`}>
                          {STATUS_LABELS[n.status]}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">{CATEGORY_LABELS[n.category]}</Badge>
                        {n.auto_drafted && (
                          <Badge variant="outline" className="text-[10px] border-gold/40 text-gold">
                            Auto-drafted {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                          </Badge>
                        )}
                        {n.requires_ack && <Badge variant="outline" className="text-[10px]">Needs "Got it"</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground whitespace-pre-line">{n.body}</p>
                      <div className="flex items-center gap-2 flex-wrap pt-1">
                        <span className="text-[11px] text-muted-foreground">Goes to:</span>
                        <AudienceBadges roles={n.target_roles ?? []} />
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Written by {names[n.created_by] ?? 'staff'}
                        {' · '}{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>

                  {(isOwner || n.created_by === myId) && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm" variant="outline" className="gap-1.5"
                        disabled={acting === n.id}
                        onClick={() => startEdit(n)}
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
                      {isOwner && (
                        <Button
                          size="sm" className="gap-1.5"
                          disabled={acting === n.id}
                          onClick={() => void review(n.id, 'approved')}
                        >
                          <Check className="h-3.5 w-3.5" /> Approve &amp; Send
                        </Button>
                      )}
                      {isOwner && (
                        <>
                          <Button
                            size="sm" variant="outline" className="gap-1.5"
                            disabled={acting === n.id}
                            onClick={() => { setDenyId(n.id); setDenyReason(''); }}
                          >
                            <Ban className="h-3.5 w-3.5" /> Deny
                          </Button>
                          <Button
                            size="sm" variant="outline" className="gap-1.5"
                            disabled={acting === n.id}
                            onClick={() => void review(n.id, 'archived')}
                          >
                            <Archive className="h-3.5 w-3.5" /> Archive
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Sent back */}
      {denied.length > 0 && (
        <div>
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-3">
            Sent Back ({denied.length})
          </h3>
          <div className="space-y-3">
            {denied.map(n => (
              <Card key={n.id} className="border-destructive/30">
                <CardContent className="py-4 px-5 space-y-1">
                  <h4 className="font-semibold text-sm">{n.title}</h4>
                  <p className="text-xs text-muted-foreground whitespace-pre-line">{n.body}</p>
                  <p className="text-xs text-destructive pt-1">
                    Reason: {n.denial_reason || 'No reason given.'}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Published */}
      <div>
        <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-3">
          Published Announcements
        </h3>
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : published.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">
            Nothing published yet.
          </p>
        ) : (
          <div className="space-y-3">
            {published
              .slice()
              .sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned))
              .map((n) => (
                <Card key={n.id} className="group">
                  <CardContent className="py-4 px-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h4 className="font-semibold text-sm truncate">{n.title}</h4>
                          {n.is_pinned && <Badge variant="outline" className="text-[10px]">Pinned</Badge>}
                          <Badge variant="outline" className="text-[10px]">{CATEGORY_LABELS[n.category]}</Badge>
                          <Badge variant="outline" className="text-[10px] shrink-0">
                            {formatDistanceToNow(new Date(n.published_at ?? n.created_at), { addSuffix: true })}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground whitespace-pre-line line-clamp-3">{n.body}</p>
                        <div className="flex items-center gap-2 flex-wrap pt-2">
                          <AudienceBadges roles={n.target_roles ?? []} />
                        </div>
                        <SeenBy note={n} />
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 h-8 w-8"
                        onClick={() => setDeleteId(n.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>
        )}
      </div>

      {/* Archived */}
      {archived.length > 0 && (
        <div>
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-3">
            Archived ({archived.length}) — never sent
          </h3>
          <div className="space-y-3">
            {archived.map(n => (
              <Card key={n.id} className="bg-muted/30">
                <CardContent className="py-3 px-5">
                  <h4 className="font-semibold text-sm">{n.title}</h4>
                  <p className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-line">{n.body}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Deny with a reason */}
      <AlertDialog open={!!denyId} onOpenChange={(v) => { if (!v) setDenyId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send this back?</AlertDialogTitle>
            <AlertDialogDescription>
              The writer sees your reason and can fix and resubmit it. Nothing is sent to staff.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={denyReason}
            onChange={(e) => setDenyReason(e.target.value)}
            placeholder="What needs changing?"
            rows={3}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!denyReason.trim()}
              onClick={() => {
                const id = denyId;
                setDenyId(null);
                if (id) void review(id, 'denied', denyReason.trim());
              }}
            >
              Send Back
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete announcement?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the announcement from the list. Notifications already sent will not be recalled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
