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
import { Send, Mail, Users, Eye, Search } from 'lucide-react';

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
  const [loading, setLoading] = useState(true);

  // Compose state
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
        .limit(50),
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
    if (histRes.data) setHistory(histRes.data as any);
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);

  const toggleId = (id: string) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  };

  const eligibleCount = scope === 'all' ? operators.length : selectedIds.size;

  const handleSend = async () => {
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-operator-broadcast', {
        body: {
          subject: subject.trim(),
          body: body.trim(),
          ctaLabel: ctaLabel.trim() || undefined,
          ctaUrl: ctaUrl.trim() || undefined,
          operatorIds: scope === 'selected' ? Array.from(selectedIds) : undefined,
        },
      });
      if (error) throw error;
      toast({
        title: 'Broadcast sent',
        description: `${data?.sent ?? 0} delivered · ${data?.failed ?? 0} failed · ${data?.skipped ?? 0} skipped`,
      });
      setSubject(''); setBody(''); setCtaLabel(''); setCtaUrl('');
      setSelectedIds(new Set()); setScope('all');
      setConfirmOpen(false);
      loadAll();
    } catch (e: any) {
      toast({ title: 'Failed to send', description: e?.message ?? String(e), variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const filteredOps = operators.filter((o) => {
    if (!pickerSearch.trim()) return true;
    const q = pickerSearch.toLowerCase();
    return o.name.toLowerCase().includes(q) || (o.unit_number ?? '').toLowerCase().includes(q);
  });

  const previewHtml = buildPreviewHtml(subject, body, ctaLabel, ctaUrl);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Mail className="h-6 w-6 text-gold" /> Operator Broadcast
        </h2>
        <p className="text-sm text-muted-foreground">
          Send a branded email to all or selected active owner-operators. All sends are archived.
        </p>
      </div>

      <Tabs defaultValue="compose">
        <TabsList>
          <TabsTrigger value="compose">Compose</TabsTrigger>
          <TabsTrigger value="archive">Archive ({history.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="compose" className="space-y-4">
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

              <div className="pt-2 border-t flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Will send to <span className="font-semibold text-foreground">{eligibleCount}</span> operator(s)
                </p>
                <Button
                  onClick={() => setConfirmOpen(true)}
                  disabled={!subject.trim() || !body.trim() || eligibleCount === 0 || sending}
                  className="gap-2"
                >
                  <Send className="h-4 w-4" /> Send Broadcast
                </Button>
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Eye className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Live preview</span>
              </div>
              <div
                className="border rounded-md overflow-hidden"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </Card>
          </div>
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