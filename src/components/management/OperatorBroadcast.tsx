import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { Send, Mail, Users, Eye, Search, Save, Clock, Pencil, Trash2, CalendarClock, CheckCircle2, Loader2 } from 'lucide-react';

interface OperatorRow {
  id: string;
  user_id: string;
  unit_number: string | null;
  name: string;
}

interface BroadcastRow {
  id: string;
  subject: string;
  body: string;
  cta_label: string | null;
  cta_url: string | null;
  recipient_scope: string;
  recipient_count: number;
  delivered_count: number;
  failed_count: number;
  skipped_count: number;
  created_at: string;
  completed_at: string | null;
  status: string;
  scheduled_at: string | null;
  selected_operator_ids: string[] | null;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildPreviewHtml(subject: string, body: string, ctaLabel?: string, ctaUrl?: string): string {
  const safeBody = escapeHtml(body || '(your message)').replace(/\n/g, '<br/>');
  const cta = ctaLabel && ctaUrl
    ? `<div style="text-align:center;margin:24px 0;"><a href="${ctaUrl}" style="background:#C9A84C;color:#0f1117;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;display:inline-block;">${escapeHtml(ctaLabel)}</a></div>`
    : '';
  return `<div style="background:#f5f5f5;padding:20px;font-family:'Helvetica Neue',Arial,sans-serif;">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
      <div style="background:#0f1117;padding:20px 32px;border-bottom:3px solid #C9A84C;">
        <p style="margin:0;color:#C9A84C;font-size:20px;font-weight:800;letter-spacing:2px;">SUPERTRANSPORT</p>
        <p style="margin:4px 0 0;color:#888;font-size:11px;letter-spacing:1px;">DRIVER OPERATIONS</p>
      </div>
      <div style="padding:32px;">
        <h1 style="margin:0 0 14px;font-size:20px;color:#0f1117;font-weight:700;">${escapeHtml(subject || '(your subject)')}</h1>
        <div style="color:#444;font-size:14px;line-height:1.7;">${safeBody}</div>
        ${cta}
      </div>
      <div style="background:#f9f9f9;padding:18px 32px;border-top:1px solid #eee;">
        <p style="margin:0;color:#999;font-size:11px;">SUPERTRANSPORT · Questions? <span style="color:#C9A84C;">support@mysupertransport.com</span></p>
      </div>
    </div>
  </div>`;
}

export function OperatorBroadcast() {
  const { toast } = useToast();
  const [operators, setOperators] = useState<OperatorRow[]>([]);
  const [history, setHistory] = useState<BroadcastRow[]>([]);
  const [drafts, setDrafts] = useState<BroadcastRow[]>([]);
  const [scheduled, setScheduled] = useState<BroadcastRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Compose state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [ctaLabel, setCtaLabel] = useState('');
  const [ctaUrl, setCtaUrl] = useState('');
  const [scope, setScope] = useState<'all' | 'selected'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [viewing, setViewing] = useState<BroadcastRow | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [finalPreviewOpen, setFinalPreviewOpen] = useState(false);
  const [finalPreviewHtml, setFinalPreviewHtml] = useState<string | null>(null);
  const [finalPreviewLoading, setFinalPreviewLoading] = useState(false);
  const [previewApproved, setPreviewApproved] = useState(false);
  const [pendingAction, setPendingAction] = useState<null | 'send' | 'schedule'>(null);

  const loadAll = async () => {
    setLoading(true);
    const [opRes, histRes] = await Promise.all([
      supabase
        .from('operators')
        .select('id, user_id, unit_number, application_id, applications(first_name, last_name)')
        .eq('is_active', true)
        .order('unit_number', { ascending: true, nullsFirst: false }),
      supabase
        .from('operator_broadcasts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100),
    ]);
    if (opRes.data) {
      setOperators(
        opRes.data.map((o: any) => ({
          id: o.id,
          user_id: o.user_id,
          unit_number: o.unit_number,
          name: o.applications
            ? `${o.applications.first_name ?? ''} ${o.applications.last_name ?? ''}`.trim() || '(no name)'
            : '(no name)',
        }))
      );
    }
    if (histRes.data) {
      const all = histRes.data as any[];
      setDrafts(all.filter((b) => b.status === 'draft'));
      setScheduled(all.filter((b) => b.status === 'scheduled'));
      setHistory(all.filter((b) => !['draft', 'scheduled'].includes(b.status)));
    }
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);

  const resetCompose = () => {
    setEditingId(null);
    setSubject(''); setBody(''); setCtaLabel(''); setCtaUrl('');
    setSelectedIds(new Set()); setScope('all');
    setScheduleDate(''); setScheduleTime('');
    setPreviewApproved(false);
    setFinalPreviewHtml(null);
  };

  const loadIntoComposer = (b: BroadcastRow) => {
    setEditingId(b.id);
    setSubject(b.subject ?? '');
    setBody(b.body ?? '');
    setCtaLabel(b.cta_label ?? '');
    setCtaUrl(b.cta_url ?? '');
    if (b.recipient_scope === 'selected' && Array.isArray(b.selected_operator_ids)) {
      setScope('selected');
      setSelectedIds(new Set(b.selected_operator_ids));
    } else {
      setScope('all');
      setSelectedIds(new Set());
    }
    if (b.scheduled_at) {
      const d = new Date(b.scheduled_at);
      const pad = (n: number) => String(n).padStart(2, '0');
      setScheduleDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
      setScheduleTime(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
    } else {
      setScheduleDate(''); setScheduleTime('');
    }
    toast({ title: b.status === 'draft' ? 'Draft loaded' : 'Scheduled broadcast loaded' });
  };

  const deleteBroadcast = async (id: string) => {
    if (!confirm('Delete this broadcast?')) return;
    const { error } = await supabase.from('operator_broadcasts').delete().eq('id', id);
    if (error) { toast({ title: 'Delete failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Deleted' });
    if (editingId === id) resetCompose();
    loadAll();
  };

  const toggleId = (id: string) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  };

  const eligibleCount = scope === 'all' ? operators.length : selectedIds.size;

  const invokeBroadcast = async (mode: 'send' | 'draft' | 'schedule', scheduledAtIso?: string) => {
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-operator-broadcast', {
        body: {
          mode,
          broadcastId: editingId ?? undefined,
          subject: subject.trim(),
          body: body.trim(),
          ctaLabel: ctaLabel.trim() || undefined,
          ctaUrl: ctaUrl.trim() || undefined,
          operatorIds: scope === 'selected' ? Array.from(selectedIds) : undefined,
          scheduledAt: scheduledAtIso,
        },
      });
      if (error) throw error;
      if (mode === 'send') {
        toast({
          title: 'Broadcast sent',
          description: `${data?.sent ?? 0} delivered · ${data?.failed ?? 0} failed · ${data?.skipped ?? 0} skipped`,
        });
      } else if (mode === 'draft') {
        toast({ title: 'Draft saved' });
      } else {
        toast({ title: 'Broadcast scheduled', description: new Date(scheduledAtIso!).toLocaleString() });
      }
      resetCompose();
      setConfirmOpen(false);
      setScheduleOpen(false);
      loadAll();
    } catch (e: any) {
      toast({ title: 'Failed', description: e?.message ?? String(e), variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const handleSend = () => invokeBroadcast('send');
  const handleSaveDraft = () => invokeBroadcast('draft');
  const handleSchedule = () => {
    if (!scheduleDate || !scheduleTime) {
      toast({ title: 'Pick a date and time', variant: 'destructive' });
      return;
    }
    const local = new Date(`${scheduleDate}T${scheduleTime}:00`);
    if (isNaN(local.getTime()) || local.getTime() <= Date.now() + 30_000) {
      toast({ title: 'Schedule must be at least 1 minute in the future', variant: 'destructive' });
      return;
    }
    invokeBroadcast('schedule', local.toISOString());
  };

  const filteredOps = operators.filter((o) => {
    if (!pickerSearch.trim()) return true;
    const q = pickerSearch.toLowerCase();
    return o.name.toLowerCase().includes(q) || (o.unit_number ?? '').toLowerCase().includes(q);
  });

  const previewHtml = buildPreviewHtml(subject, body, ctaLabel, ctaUrl);

  // Invalidate the "approved" stamp whenever the content changes.
  useEffect(() => {
    setPreviewApproved(false);
    setFinalPreviewHtml(null);
  }, [subject, body, ctaLabel, ctaUrl]);

  const fetchFinalPreview = async () => {
    setFinalPreviewLoading(true);
    setFinalPreviewOpen(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-operator-broadcast', {
        body: {
          mode: 'render',
          subject: subject.trim(),
          body: body.trim(),
          ctaLabel: ctaLabel.trim() || undefined,
          ctaUrl: ctaUrl.trim() || undefined,
        },
      });
      if (error) throw error;
      setFinalPreviewHtml(data?.html ?? null);
    } catch (e: any) {
      toast({ title: 'Preview failed', description: e?.message ?? String(e), variant: 'destructive' });
      setFinalPreviewOpen(false);
    } finally {
      setFinalPreviewLoading(false);
    }
  };

  const approveAndProceed = (action: 'send' | 'schedule') => {
    setPreviewApproved(true);
    setFinalPreviewOpen(false);
    if (action === 'send') setConfirmOpen(true);
    else setScheduleOpen(true);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Mail className="h-6 w-6 text-gold" /> Operator Broadcast
        </h2>
        <p className="text-sm text-muted-foreground">
          Send a branded email now, save it as a draft, or schedule it for a future date and time.
        </p>
      </div>

      <Tabs defaultValue="compose">
        <TabsList>
          <TabsTrigger value="compose">{editingId ? 'Edit' : 'Compose'}</TabsTrigger>
          <TabsTrigger value="drafts">Drafts ({drafts.length})</TabsTrigger>
          <TabsTrigger value="scheduled">Scheduled ({scheduled.length})</TabsTrigger>
          <TabsTrigger value="archive">Archive ({history.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="compose" className="space-y-4">
          {editingId && (
            <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <span className="flex items-center gap-2">
                <Pencil className="h-4 w-4 text-muted-foreground" />
                Editing existing broadcast
              </span>
              <Button variant="ghost" size="sm" onClick={resetCompose}>Start new</Button>
            </div>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-4 space-y-4">
              <div>
                <Label>Subject</Label>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  maxLength={200}
                  placeholder="e.g., Important update for all drivers"
                />
                <p className="text-xs text-muted-foreground mt-1">{subject.length}/200</p>
              </div>
              <div>
                <Label>Message body</Label>
                <Textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  maxLength={10000}
                  rows={8}
                  placeholder="Write your message. Line breaks are preserved."
                />
                <p className="text-xs text-muted-foreground mt-1">{body.length}/10000</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>CTA button label (optional)</Label>
                  <Input value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} placeholder="View in Portal" />
                </div>
                <div>
                  <Label>CTA URL (optional)</Label>
                  <Input value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder="https://..." />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Recipients</Label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant={scope === 'all' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setScope('all')}
                  >
                    <Users className="h-4 w-4" /> All active operators ({operators.length})
                  </Button>
                  <Button
                    type="button"
                    variant={scope === 'selected' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => { setScope('selected'); setPickerOpen(true); }}
                  >
                    Select operators… {scope === 'selected' && `(${selectedIds.size})`}
                  </Button>
                </div>
              </div>

              <div className="pt-2 border-t space-y-3">
                <p className="text-sm text-muted-foreground">
                  Will send to <span className="font-semibold text-foreground">{eligibleCount}</span> operator(s)
                </p>
                <div className="flex flex-wrap gap-2 justify-end">
                  <Button
                    variant="outline"
                    onClick={handleSaveDraft}
                    disabled={sending || (!subject.trim() && !body.trim())}
                    className="gap-2"
                  >
                    <Save className="h-4 w-4" /> Save Draft
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (previewApproved) setScheduleOpen(true);
                      else { setPendingAction('schedule'); fetchFinalPreview(); }
                    }}
                    disabled={!subject.trim() || !body.trim() || eligibleCount === 0 || sending}
                    className="gap-2"
                  >
                    <CalendarClock className="h-4 w-4" /> Schedule…
                  </Button>
                  <Button
                    onClick={() => {
                      if (previewApproved) setConfirmOpen(true);
                      else { setPendingAction('send'); fetchFinalPreview(); }
                    }}
                    disabled={!subject.trim() || !body.trim() || eligibleCount === 0 || sending}
                    className="gap-2"
                  >
                    <Send className="h-4 w-4" /> Send Now
                  </Button>
                </div>
                {previewApproved && (
                  <p className="text-xs text-green-600 flex items-center gap-1 justify-end">
                    <CheckCircle2 className="h-3 w-3" /> Final preview approved
                  </p>
                )}
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Eye className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Live preview</span>
                <span className="text-xs text-muted-foreground ml-auto">Approximate — confirm with final preview before sending</span>
              </div>
              <div
                className="border rounded-md overflow-hidden"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
              <Button
                variant="outline"
                size="sm"
                className="mt-3 w-full gap-2"
                onClick={fetchFinalPreview}
                disabled={!subject.trim() || !body.trim() || finalPreviewLoading}
              >
                {finalPreviewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                Render final email
              </Button>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="drafts">
          <Card className="p-4">
            {drafts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No drafts saved.</p>
            ) : (
              <div className="space-y-2">
                {drafts.map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-3 border rounded-md px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{d.subject || '(untitled draft)'}</p>
                      <p className="text-xs text-muted-foreground">Updated {new Date(d.created_at).toLocaleString()}</p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <Button size="sm" variant="outline" onClick={() => loadIntoComposer(d)} className="gap-1">
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteBroadcast(d.id)} className="gap-1 text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="scheduled">
          <Card className="p-4">
            {scheduled.length === 0 ? (
              <p className="text-sm text-muted-foreground">No scheduled broadcasts.</p>
            ) : (
              <div className="space-y-2">
                {scheduled.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-3 border rounded-md px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{s.subject}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Sends {s.scheduled_at ? new Date(s.scheduled_at).toLocaleString() : '—'} · {s.recipient_scope === 'all' ? 'All active' : 'Selected'}
                      </p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <Button size="sm" variant="outline" onClick={() => loadIntoComposer(s)} className="gap-1">
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteBroadcast(s.id)} className="gap-1 text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="archive">
          <Card className="p-4">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : history.length === 0 ? (
              <p className="text-sm text-muted-foreground">No broadcasts sent yet.</p>
            ) : (
              <div className="space-y-2">
                {history.map((h) => (
                  <div
                    key={h.id}
                    className="flex items-center justify-between gap-3 border rounded-md px-3 py-2 hover:bg-muted/50 cursor-pointer"
                    onClick={() => setViewing(h)}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{h.subject}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(h.created_at).toLocaleString()} · {h.recipient_scope === 'all' ? 'All active' : 'Selected'}
                      </p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <Badge variant="outline" className="text-xs">{h.recipient_count} total</Badge>
                      <Badge className="bg-green-600 text-xs">{h.delivered_count} sent</Badge>
                      {h.failed_count > 0 && <Badge variant="destructive" className="text-xs">{h.failed_count} failed</Badge>}
                      {h.skipped_count > 0 && <Badge variant="secondary" className="text-xs">{h.skipped_count} skipped</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {/* Picker dialog */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Select operators</DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search by name or unit…"
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-2 text-xs">
            <button className="text-primary hover:underline" onClick={() => setSelectedIds(new Set(filteredOps.map((o) => o.id)))}>Select all visible</button>
            <span className="text-muted-foreground">·</span>
            <button className="text-primary hover:underline" onClick={() => setSelectedIds(new Set())}>Clear</button>
          </div>
          <ScrollArea className="h-[360px] border rounded-md">
            <div className="p-1">
              {filteredOps.map((o) => (
                <label
                  key={o.id}
                  className="flex items-center gap-3 p-2 rounded hover:bg-muted cursor-pointer"
                >
                  <Checkbox checked={selectedIds.has(o.id)} onCheckedChange={() => toggleId(o.id)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{o.name}</p>
                    <p className="text-xs text-muted-foreground">Unit {o.unit_number ?? '—'}</p>
                  </div>
                </label>
              ))}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPickerOpen(false)}>Cancel</Button>
            <Button onClick={() => setPickerOpen(false)}>Done ({selectedIds.size})</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm send */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send broadcast email?</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            This will email <span className="font-semibold">{eligibleCount}</span> active operator(s) with the subject
            "<span className="font-medium">{subject}</span>".
          </p>
          <p className="text-xs text-muted-foreground">
            The send is rate-limited (~600ms per recipient) and may take a moment to complete.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={sending}>Cancel</Button>
            <Button onClick={handleSend} disabled={sending} className="gap-2">
              <Send className="h-4 w-4" /> {sending ? 'Sending…' : 'Confirm & Send'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule dialog */}
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule broadcast</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Pick a date and time (your local time zone). The system will send the email automatically.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Date</Label>
              <Input type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} />
            </div>
            <div>
              <Label>Time</Label>
              <Input type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Will send to <span className="font-semibold">{eligibleCount}</span> operator(s).
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleOpen(false)} disabled={sending}>Cancel</Button>
            <Button onClick={handleSchedule} disabled={sending} className="gap-2">
              <CalendarClock className="h-4 w-4" /> {sending ? 'Scheduling…' : 'Schedule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Final render preview */}
      <Dialog open={finalPreviewOpen} onOpenChange={(o) => { if (!o) { setFinalPreviewOpen(false); setPendingAction(null); } }}>
        <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-gold" /> Final email preview
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            This is the exact branded email recipients will receive, rendered server-side using the production template.
          </p>
          {finalPreviewLoading || !finalPreviewHtml ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Rendering…
            </div>
          ) : (
            <div
              className="border rounded-md overflow-hidden"
              dangerouslySetInnerHTML={{ __html: finalPreviewHtml }}
            />
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setFinalPreviewOpen(false); setPendingAction(null); }}>
              Back to edit
            </Button>
            {pendingAction === 'schedule' ? (
              <Button
                onClick={() => approveAndProceed('schedule')}
                disabled={!finalPreviewHtml || finalPreviewLoading}
                className="gap-2"
              >
                <CalendarClock className="h-4 w-4" /> Looks good — Schedule…
              </Button>
            ) : pendingAction === 'send' ? (
              <Button
                onClick={() => approveAndProceed('send')}
                disabled={!finalPreviewHtml || finalPreviewLoading}
                className="gap-2"
              >
                <Send className="h-4 w-4" /> Looks good — Send Now
              </Button>
            ) : (
              <Button
                onClick={() => { setPreviewApproved(true); setFinalPreviewOpen(false); }}
                disabled={!finalPreviewHtml || finalPreviewLoading}
                className="gap-2"
              >
                <CheckCircle2 className="h-4 w-4" /> Approve preview
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive viewer */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
          {viewing && (
            <>
              <DialogHeader>
                <DialogTitle>{viewing.subject}</DialogTitle>
              </DialogHeader>
              <div className="text-xs text-muted-foreground">
                Sent {new Date(viewing.created_at).toLocaleString()} · {viewing.recipient_count} recipients ·
                {' '}{viewing.delivered_count} delivered · {viewing.failed_count} failed · {viewing.skipped_count} skipped
              </div>
              <div
                className="border rounded-md overflow-hidden"
                dangerouslySetInnerHTML={{
                  __html: buildPreviewHtml(viewing.subject, viewing.body, viewing.cta_label ?? undefined, viewing.cta_url ?? undefined),
                }}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default OperatorBroadcast;