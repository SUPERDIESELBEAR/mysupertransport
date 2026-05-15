import { useEffect, useMemo, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Mail, RefreshCw, Send, Search, AlertCircle, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

type LogRow = {
  id: string;
  message_id: string | null;
  template_name: string;
  recipient_email: string;
  status: string;
  error_message: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
};

type RangePreset = '24h' | '7d' | '30d' | 'all';

const RANGE_HOURS: Record<RangePreset, number | null> = {
  '24h': 24,
  '7d': 24 * 7,
  '30d': 24 * 30,
  'all': null,
};

function statusBadge(status: string) {
  const map: Record<string, { cls: string; icon: any; label: string }> = {
    sent: { cls: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: CheckCircle2, label: 'Sent' },
    pending: { cls: 'bg-amber-100 text-amber-800 border-amber-200', icon: Clock, label: 'Pending' },
    failed: { cls: 'bg-rose-100 text-rose-800 border-rose-200', icon: XCircle, label: 'Failed' },
    dlq: { cls: 'bg-rose-200 text-rose-900 border-rose-300', icon: AlertCircle, label: 'DLQ' },
    suppressed: { cls: 'bg-slate-200 text-slate-800 border-slate-300', icon: AlertCircle, label: 'Suppressed' },
    bounced: { cls: 'bg-orange-100 text-orange-800 border-orange-200', icon: AlertCircle, label: 'Bounced' },
    complained: { cls: 'bg-orange-200 text-orange-900 border-orange-300', icon: AlertCircle, label: 'Complaint' },
  };
  const info = map[status] ?? { cls: 'bg-slate-100 text-slate-700 border-slate-200', icon: Mail, label: status };
  const Icon = info.icon;
  return (
    <Badge variant="outline" className={`${info.cls} gap-1 font-medium`}>
      <Icon className="h-3 w-3" />
      {info.label}
    </Badge>
  );
}

function isResendable(template: string): boolean {
  return template === 'application-revisions-requested'
      || template === 'application-resume-link'
      || template === 'application-revisions-resent'
      || template === 'application-resume-resent';
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { timeZone: 'America/Chicago' });
}

export default function EmailLogPanel() {
  const { toast } = useToast();
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<RangePreset>('7d');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [templateFilter, setTemplateFilter] = useState<string>('all');
  const [searchQ, setSearchQ] = useState('');
  const [resendingId, setResendingId] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const hours = RANGE_HOURS[range];
    const since = hours ? new Date(Date.now() - hours * 60 * 60 * 1000).toISOString() : null;

    let q = supabase
      .from('email_send_log')
      .select('id, message_id, template_name, recipient_email, status, error_message, metadata, created_at')
      .order('created_at', { ascending: false })
      .limit(500);
    if (since) q = q.gte('created_at', since);

    const { data, error } = await q;
    if (error) {
      console.error('email_send_log fetch error:', error);
      toast({ title: 'Failed to load email log', description: error.message, variant: 'destructive' });
      setRows([]);
    } else {
      setRows((data as LogRow[]) ?? []);
    }
    setLoading(false);
  }, [range, toast]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // Deduplicate by message_id (keep latest status)
  const dedupedRows = useMemo(() => {
    const seen = new Set<string>();
    const out: LogRow[] = [];
    for (const r of rows) {
      const key = r.message_id ?? r.id;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(r);
    }
    return out;
  }, [rows]);

  const templates = useMemo(() => {
    const set = new Set<string>();
    dedupedRows.forEach(r => set.add(r.template_name));
    return Array.from(set).sort();
  }, [dedupedRows]);

  const filtered = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    return dedupedRows.filter(r => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (templateFilter !== 'all' && r.template_name !== templateFilter) return false;
      if (q && !r.recipient_email.toLowerCase().includes(q) && !r.template_name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [dedupedRows, statusFilter, templateFilter, searchQ]);

  const stats = useMemo(() => {
    const s = { total: filtered.length, sent: 0, pending: 0, failed: 0 };
    for (const r of filtered) {
      if (r.status === 'sent') s.sent++;
      else if (r.status === 'pending') s.pending++;
      else if (r.status === 'failed' || r.status === 'dlq' || r.status === 'bounced') s.failed++;
    }
    return s;
  }, [filtered]);

  const failingApplications = useMemo(() => {
    // Grab unique applications with a failed application-link email recently
    const map = new Map<string, { applicationId: string; recipient: string; lastFailedAt: string; template: string }>();
    for (const r of dedupedRows) {
      if (!isResendable(r.template_name)) continue;
      if (r.status !== 'failed' && r.status !== 'dlq' && r.status !== 'bounced') continue;
      const appId = r.metadata?.application_id;
      if (!appId || typeof appId !== 'string') continue;
      if (!map.has(appId)) {
        map.set(appId, { applicationId: appId, recipient: r.recipient_email, lastFailedAt: r.created_at, template: r.template_name });
      }
    }
    return Array.from(map.values());
  }, [dedupedRows]);

  const handleResend = useCallback(async (applicationId: string, recipient: string) => {
    setResendingId(applicationId);
    try {
      const { data, error } = await supabase.functions.invoke('resend-application-link', {
        body: { applicationId },
      });
      if (error) throw error;
      const mode = (data as any)?.mode === 'revisions' ? 'revisions' : 'resume';
      toast({
        title: 'Fresh link sent',
        description: `Sent a new ${mode} link to ${recipient}.`,
      });
      // Refresh after a short delay so the new pending+sent rows appear
      setTimeout(() => fetchLogs(), 800);
    } catch (e: any) {
      toast({
        title: 'Resend failed',
        description: e?.message || String(e),
        variant: 'destructive',
      });
    } finally {
      setResendingId(null);
    }
  }, [toast, fetchLogs]);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Email Log & Resend</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track all transactional emails. Resend application links if an applicant reports a broken or expired URL.
          </p>
        </div>
        <Button variant="outline" onClick={fetchLogs} disabled={loading} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total emails" value={stats.total} accent="text-foreground" />
        <StatCard label="Sent" value={stats.sent} accent="text-emerald-600" />
        <StatCard label="Pending" value={stats.pending} accent="text-amber-600" />
        <StatCard label="Failed" value={stats.failed} accent="text-rose-600" />
      </div>

      {/* Resend panel */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Send className="h-4 w-4 text-gold" />
            Resend application link
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {failingApplications.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent application emails are flagged as failed. Use the manual resender below if an applicant reports a broken link.</p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Recent failed/bounced application emails</p>
              {failingApplications.map(f => (
                <div key={f.applicationId} className="flex items-center justify-between gap-3 p-3 border border-border rounded-md bg-muted/30">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{f.recipient}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {f.template} · last failure {formatTimestamp(f.lastFailedAt)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleResend(f.applicationId, f.recipient)}
                    disabled={resendingId === f.applicationId}
                    className="gap-1 shrink-0"
                  >
                    <Send className="h-3.5 w-3.5" />
                    {resendingId === f.applicationId ? 'Sending…' : 'Resend'}
                  </Button>
                </div>
              ))}
            </div>
          )}

          <ManualResender onResend={handleResend} resendingId={resendingId} />
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Email log</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col md:flex-row gap-3 md:items-center">
            <Tabs value={range} onValueChange={(v) => setRange(v as RangePreset)}>
              <TabsList>
                <TabsTrigger value="24h">24h</TabsTrigger>
                <TabsTrigger value="7d">7 days</TabsTrigger>
                <TabsTrigger value="30d">30 days</TabsTrigger>
                <TabsTrigger value="all">All</TabsTrigger>
              </TabsList>
            </Tabs>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="md:w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="dlq">DLQ</SelectItem>
                <SelectItem value="bounced">Bounced</SelectItem>
                <SelectItem value="suppressed">Suppressed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={templateFilter} onValueChange={setTemplateFilter}>
              <SelectTrigger className="md:w-[260px]"><SelectValue placeholder="Template" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All templates</SelectItem>
                {templates.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="relative md:flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="Search recipient or template…"
                className="pl-8"
              />
            </div>
          </div>

          <div className="border border-border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Template</th>
                  <th className="text-left px-3 py-2 font-semibold">Recipient</th>
                  <th className="text-left px-3 py-2 font-semibold">Status</th>
                  <th className="text-left px-3 py-2 font-semibold hidden md:table-cell">Sent</th>
                  <th className="text-right px-3 py-2 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="text-center text-muted-foreground py-8">Loading…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={5} className="text-center text-muted-foreground py-8">No emails match the current filters.</td></tr>
                ) : filtered.map(r => {
                  const appId = r.metadata?.application_id as string | undefined;
                  const canResend = !!appId && isResendable(r.template_name);
                  return (
                    <tr key={r.id} className="border-t border-border align-top">
                      <td className="px-3 py-2">
                        <p className="font-medium text-foreground">{r.template_name}</p>
                        {r.error_message && (
                          <p className="text-xs text-rose-600 mt-1 truncate max-w-[260px]" title={r.error_message}>{r.error_message}</p>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{r.recipient_email}</td>
                      <td className="px-3 py-2">{statusBadge(r.status)}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground hidden md:table-cell">{formatTimestamp(r.created_at)}</td>
                      <td className="px-3 py-2 text-right">
                        {canResend && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleResend(appId!, r.recipient_email)}
                            disabled={resendingId === appId}
                            className="gap-1"
                          >
                            <Send className="h-3.5 w-3.5" />
                            {resendingId === appId ? 'Sending…' : 'Resend'}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">{label}</p>
        <p className={`text-2xl font-bold mt-1 ${accent}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function ManualResender({
  onResend,
  resendingId,
}: {
  onResend: (applicationId: string, recipient: string) => void;
  resendingId: string | null;
}) {
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [looking, setLooking] = useState(false);

  const handleLookup = useCallback(async () => {
    const q = email.trim().toLowerCase();
    if (!q) return;
    setLooking(true);
    try {
      const { data, error } = await supabase
        .from('applications')
        .select('id, email, first_name, last_name, review_status, is_draft, updated_at')
        .ilike('email', q)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        toast({ title: 'No application found', description: `No application matches ${q}.`, variant: 'destructive' });
        return;
      }
      onResend(data.id, data.email);
    } catch (e: any) {
      toast({ title: 'Lookup failed', description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setLooking(false);
    }
  }, [email, toast, onResend]);

  return (
    <div className="border border-border rounded-md p-3 bg-muted/20 space-y-2">
      <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Manual resend by applicant email</p>
      <div className="flex flex-col md:flex-row gap-2">
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="applicant@example.com"
          className="md:flex-1"
        />
        <Button
          onClick={handleLookup}
          disabled={looking || !email.trim() || !!resendingId}
          className="gap-1"
        >
          <Send className="h-4 w-4" />
          {looking ? 'Looking up…' : 'Send fresh link'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Sends the latest resume/revision link with a fresh 24h–7d token (depending on application status). Doesn't bump the revision count.
      </p>
    </div>
  );
}