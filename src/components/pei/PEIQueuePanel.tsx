import { useEffect, useState, useMemo } from 'react';
import { toast } from 'sonner';
import { ShieldCheck, AlertTriangle, Clock, Mail, Send, Loader2, FileWarning, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { fetchPEIQueue } from '@/lib/pei/api';
import type { PEIQueueRow } from '@/lib/pei/types';
import { PEIStatusBadge } from './StatusBadge';
import { sendPEIEmail } from './sendPEIEmail';
import { GFEModal } from './GFEModal';

interface Props {
  onOpenApplication?: (applicationId: string) => void;
}

export default function PEIQueuePanel({ onOpenApplication }: Props) {
  const [rows, setRows] = useState<PEIQueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [gfeFor, setGfeFor] = useState<{ id: string; employer: string } | null>(null);

  async function reload() {
    setLoading(true);
    try {
      setRows(await fetchPEIQueue());
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to load PEI queue');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(); }, []);

  const stats = useMemo(() => {
    const total = rows.length;
    const awaiting = rows.filter(r => r.status === 'sent' && (r.days_remaining ?? 999) > 15).length;
    const followUp = rows.filter(r => r.status === 'sent' && (r.days_remaining ?? 999) <= 15 && (r.days_remaining ?? 0) >= 0).length;
    const overdue = rows.filter(r => r.is_overdue).length;
    return { total, awaiting, followUp, overdue };
  }, [rows]);

  async function handleSend(row: PEIQueueRow, kind: 'initial' | 'follow_up' | 'final_notice') {
    setBusy(row.request_id);
    try {
      await sendPEIEmail(row.request_id, kind);
      toast.success(`PEI email sent to ${row.employer_name}`);
      await reload();
    } catch (e: any) {
      toast.error(e.message ?? 'Email send failed');
    } finally {
      setBusy(null);
    }
  }

  function actionFor(row: PEIQueueRow) {
    if (row.status === 'pending') return { label: 'Send PEI', kind: 'initial' as const };
    const days = row.date_sent ? Math.floor((Date.now() - new Date(row.date_sent).getTime()) / 86400000) : 0;
    if (row.status === 'sent' && days >= 15 && days < 25) return { label: 'Send Follow-Up', kind: 'follow_up' as const };
    if ((row.status === 'sent' || row.status === 'follow_up_sent') && days >= 25 && days < 30) return { label: 'Send Final Notice', kind: 'final_notice' as const };
    if (days >= 30 || row.is_overdue) return { label: 'Document GFE', kind: 'gfe' as const };
    return null;
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-gold" />
          Previous Employment Investigations
        </h1>
        <p className="text-sm text-muted-foreground mt-1">49 CFR §391.23 Compliance Tracking</p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile icon={<Mail className="h-4 w-4" />} label="Total Open" value={stats.total} />
        <StatTile icon={<Clock className="h-4 w-4" />} label="Awaiting Response" value={stats.awaiting} />
        <StatTile icon={<Send className="h-4 w-4" />} label="Follow-Up Needed" value={stats.followUp} tone="warning" />
        <StatTile icon={<AlertTriangle className="h-4 w-4" />} label="Overdue / GFE" value={stats.overdue} tone="destructive" />
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline mr-2" />Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center">
            <ShieldCheck className="h-10 w-10 mx-auto text-emerald-500 mb-3" />
            <p className="font-medium">All Previous Employment Investigations are current.</p>
            <p className="text-sm text-muted-foreground mt-1">No action needed.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3">Applicant</th>
                  <th className="text-left px-4 py-3">Previous Employer</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Date Sent</th>
                  <th className="text-left px-4 py-3">Days Remaining</th>
                  <th className="text-right px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => {
                  const action = actionFor(r);
                  const fullName = [r.applicant_first_name, r.applicant_last_name].filter(Boolean).join(' ') || '—';
                  return (
                    <tr key={r.request_id} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <button
                          className="text-left font-medium hover:underline"
                          onClick={() => onOpenApplication?.(r.application_id)}
                        >
                          {fullName}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div>{r.employer_name}</div>
                        {(r.employer_city || r.employer_state) && (
                          <div className="text-xs text-muted-foreground">{[r.employer_city, r.employer_state].filter(Boolean).join(', ')}</div>
                        )}
                      </td>
                      <td className="px-4 py-3"><PEIStatusBadge status={r.status} /></td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {r.date_sent ? new Date(r.date_sent).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={r.is_overdue ? 'text-destructive font-semibold' : ''}>
                          {r.days_remaining == null ? '—' : `${r.days_remaining}`}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {action && action.kind !== 'gfe' && (
                          <Button size="sm" disabled={busy === r.request_id} onClick={() => handleSend(r, action.kind)}>
                            {busy === r.request_id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Send className="h-3 w-3 mr-1" />}
                            {action.label}
                          </Button>
                        )}
                        {action?.kind === 'gfe' && (
                          <Button size="sm" variant="outline" onClick={() => setGfeFor({ id: r.request_id, employer: r.employer_name })}>
                            <FileWarning className="h-3 w-3 mr-1" />{action.label}
                          </Button>
                        )}
                        {!action && (
                          <Button size="sm" variant="ghost" onClick={() => onOpenApplication?.(r.application_id)}>
                            <Eye className="h-3 w-3 mr-1" />View
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {gfeFor && (
        <GFEModal
          open
          requestId={gfeFor.id}
          employerName={gfeFor.employer}
          onClose={() => setGfeFor(null)}
          onDone={() => { setGfeFor(null); reload(); }}
        />
      )}
    </div>
  );
}

function StatTile({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone?: 'warning' | 'destructive' }) {
  const valueClass = tone === 'destructive' && value > 0 ? 'text-destructive' : tone === 'warning' && value > 0 ? 'text-amber-600 dark:text-amber-400' : '';
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wide">{icon}{label}</div>
      <div className={`mt-2 text-2xl font-semibold ${valueClass}`}>{value}</div>
    </Card>
  );
}