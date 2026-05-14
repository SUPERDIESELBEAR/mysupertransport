import { useEffect, useState, useMemo } from 'react';
import { toast } from 'sonner';
import { ShieldCheck, AlertTriangle, Clock, Mail, Send, Loader2, FileWarning, Eye, FileText, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { fetchPEIQueue } from '@/lib/pei/api';
import type { PEIQueueRow, PEIRequestStatus } from '@/lib/pei/types';
import { PEIStatusBadge } from './StatusBadge';
import { sendPEIEmail } from './sendPEIEmail';
import { GFEModal } from './GFEModal';
import PEITemplateViewer from './PEITemplateViewer';

interface Props {
  onOpenApplication?: (applicationId: string) => void;
}

const STATUS_ORDER: PEIRequestStatus[] = [
  'pending',
  'sent',
  'follow_up_sent',
  'final_notice_sent',
  'completed',
  'gfe_documented',
];

export default function PEIQueuePanel({ onOpenApplication }: Props) {
  const [rows, setRows] = useState<PEIQueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [gfeFor, setGfeFor] = useState<{ id: string; employer: string } | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'sent' | 'overdue' | 'completed' | 'gfe'>('all');
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

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

  const filteredRows = useMemo(() => {
    if (filter === 'all') return rows;
    if (filter === 'overdue') return rows.filter(r => r.is_overdue);
    if (filter === 'pending') return rows.filter(r => r.status === 'pending');
    if (filter === 'sent') return rows.filter(r => r.status === 'sent' || r.status === 'follow_up_sent' || r.status === 'final_notice_sent');
    if (filter === 'completed') return rows.filter(r => r.status === 'completed');
    if (filter === 'gfe') return rows.filter(r => r.status === 'gfe_documented');
    return rows;
  }, [rows, filter]);

  const grouped = useMemo(() => {
    const map = new Map<string, PEIQueueRow[]>();
    for (const row of filteredRows) {
      const list = map.get(row.application_id) ?? [];
      list.push(row);
      map.set(row.application_id, list);
    }
    return Array.from(map.entries())
      .map(([applicationId, rows]) => ({
        applicationId,
        rows,
        fullName: [rows[0].applicant_first_name, rows[0].applicant_last_name].filter(Boolean).join(' ') || '—',
      }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [filteredRows]);

  function toggleGroup(id: string) {
    setOpenGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function expandAll() {
    setOpenGroups(new Set(grouped.map(g => g.applicationId)));
  }

  function collapseAll() {
    setOpenGroups(new Set());
  }

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

  function deadlineLabel(r: PEIQueueRow): string {
    if (r.days_remaining == null) return '—';
    if (r.days_remaining < 0 || r.is_overdue) return `Overdue ${Math.abs(r.days_remaining)}d`;
    if (r.days_remaining === 0) return 'Due today';
    return `Due in ${r.days_remaining}d`;
  }

  function groupSummary(groupRows: PEIQueueRow[]) {
    const counts: Record<string, number> = {};
    for (const r of groupRows) {
      counts[r.status] = (counts[r.status] ?? 0) + 1;
    }
    const overdue = groupRows.filter(r => r.is_overdue).length;
    return { counts, overdue };
  }

  const FILTERS: Array<{ key: typeof filter; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'pending', label: 'Pending' },
    { key: 'sent', label: 'Sent' },
    { key: 'overdue', label: 'Overdue' },
    { key: 'completed', label: 'Completed' },
    { key: 'gfe', label: 'GFE' },
  ];

  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <ShieldCheck className="h-6 w-6 text-gold" />
              Previous Employment Investigations
            </h1>
            <p className="text-sm text-muted-foreground mt-1">49 CFR §391.23 Compliance Tracking</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setTemplatesOpen(true)}
            className="gap-2"
          >
            <FileText className="h-4 w-4" />
            View email templates
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile icon={<Mail className="h-4 w-4" />} label="Total Open" value={stats.total} />
        <StatTile icon={<Clock className="h-4 w-4" />} label="Awaiting Response" value={stats.awaiting} />
        <StatTile icon={<Send className="h-4 w-4" />} label="Follow-Up Needed" value={stats.followUp} tone="warning" />
        <StatTile icon={<AlertTriangle className="h-4 w-4" />} label="Overdue / GFE" value={stats.overdue} tone="destructive" />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-1.5 p-3 border-b bg-muted/20">
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  active
                    ? 'bg-foreground text-background border-foreground'
                    : 'bg-background text-muted-foreground hover:text-foreground border-border'
                }`}
              >
                {f.label}
              </button>
            );
          })}
          <div className="ml-auto flex gap-2">
            <button
              onClick={expandAll}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              Expand all
            </button>
            <button
              onClick={collapseAll}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              Collapse all
            </button>
          </div>
        </div>
        {loading ? (
          <div className="p-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline mr-2" />Loading…</div>
        ) : filteredRows.length === 0 ? (
          <div className="p-12 text-center">
            <ShieldCheck className="h-10 w-10 mx-auto text-emerald-500 mb-3" />
            <p className="font-medium">{rows.length === 0 ? 'All Previous Employment Investigations are current.' : 'No requests match this filter.'}</p>
            <p className="text-sm text-muted-foreground mt-1">{rows.length === 0 ? 'No action needed.' : 'Try a different filter.'}</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {grouped.map((group) => {
              const isOpen = openGroups.has(group.applicationId);
              const summary = groupSummary(group.rows);
              const hasOverdue = summary.overdue > 0;
              return (
                <Collapsible
                  key={group.applicationId}
                  open={isOpen}
                  onOpenChange={() => toggleGroup(group.applicationId)}
                >
                  <CollapsibleTrigger asChild>
                    <button className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors">
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{group.fullName}</span>
                          <Badge variant="secondary" className="text-xs">
                            {group.rows.length} {group.rows.length === 1 ? 'employer' : 'employers'}
                          </Badge>
                          {hasOverdue && (
                            <Badge variant="destructive" className="text-xs">
                              {summary.overdue} overdue
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {STATUS_ORDER.filter(s => summary.counts[s] > 0).map(s => (
                            <span key={s} className="text-[11px] text-muted-foreground">
                              {summary.counts[s]} {s.replace(/_/g, ' ')}
                            </span>
                          ))}
                        </div>
                      </div>
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                          <tr>
                            <th className="text-left px-4 py-2 pl-12">Previous Employer</th>
                            <th className="text-left px-4 py-2">Status</th>
                            <th className="text-left px-4 py-2">Date Sent</th>
                            <th className="text-left px-4 py-2">Deadline</th>
                            <th className="text-right px-4 py-2">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {group.rows.map((r) => {
                            const action = actionFor(r);
                            return (
                              <tr key={r.request_id} className="hover:bg-muted/30">
                                <td className="px-4 py-3 pl-12">
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
                                    {deadlineLabel(r)}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <div className="flex justify-end gap-1.5 flex-wrap">
                                    {action && action.kind !== 'gfe' && (
                                      <Button size="sm" disabled={busy === r.request_id} onClick={() => handleSend(r, action.kind)}>
                                        {busy === r.request_id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Send className="h-3 w-3 mr-1" />}
                                        {action.label}
                                      </Button>
                                    )}
                                    {r.status !== 'completed' && r.status !== 'gfe_documented' && (
                                      <Button size="sm" variant="ghost" onClick={() => setGfeFor({ id: r.request_id, employer: r.employer_name })}>
                                        <FileWarning className="h-3 w-3 mr-1" />GFE
                                      </Button>
                                    )}
                                    <Button size="sm" variant="ghost" onClick={() => onOpenApplication?.(r.application_id)}>
                                      <Eye className="h-3 w-3 mr-1" />Open
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
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
      <PEITemplateViewer open={templatesOpen} onOpenChange={setTemplatesOpen} />
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
