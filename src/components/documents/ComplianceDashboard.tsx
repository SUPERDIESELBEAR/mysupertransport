import { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2, AlertTriangle, Bell, ChevronDown, ChevronUp,
  RefreshCw, Users, ShieldCheck, Mail, MailCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { DriverDocument } from './DocumentHubTypes';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useDemoMode } from '@/hooks/useDemoMode';

interface OperatorRow {
  operator_id: string;
  user_id: string;
  name: string;
  email: string;
}

interface AckRecord {
  user_id: string;
  document_version: number;
}

interface DocComplianceData {
  doc: DriverDocument;
  acks: AckRecord[];            // current-version acks
  pending: OperatorRow[];       // operators who haven't acked current version
  acknowledged: OperatorRow[];  // operators who have
}

interface ComplianceDashboardProps {
  documents: DriverDocument[];
}

// ── Summary card ─────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color }: { label: string; value: number | string; sub?: string; color?: string }) {
  return (
    <div className="bg-card border border-border rounded-xl px-5 py-4">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color ?? 'text-foreground'}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Per-operator row inside an expanded document ──────────────────────────────
function OperatorStatusRow({
  op,
  acked,
  docTitle,
  docId,
  sending,
  onSend,
}: {
  op: OperatorRow;
  acked: boolean;
  docTitle: string;
  docId: string;
  sending: boolean;
  onSend: (op: OperatorRow) => void;
}) {
  return (
    <TableRow className="hover:bg-secondary/20">
      <TableCell className="py-2.5">
        <p className="text-sm font-medium text-foreground">{op.name}</p>
        {op.email && <p className="text-xs text-muted-foreground">{op.email}</p>}
      </TableCell>
      <TableCell className="py-2.5">
        {acked ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-status-complete bg-status-complete/10 border border-status-complete/30 rounded-full px-2.5 py-0.5">
            <CheckCircle2 className="h-3 w-3" /> Acknowledged
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive bg-destructive/10 border border-destructive/30 rounded-full px-2.5 py-0.5">
            <AlertTriangle className="h-3 w-3" /> Pending
          </span>
        )}
      </TableCell>
      <TableCell className="py-2.5 text-right">
        {!acked && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1.5 border-border"
            disabled={sending}
            onClick={() => onSend(op)}
          >
            {sending ? (
              <><RefreshCw className="h-3 w-3 animate-spin" /> Sending…</>
            ) : (
              <><Bell className="h-3 w-3" /> Remind</>
            )}
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ComplianceDashboard({ documents }: ComplianceDashboardProps) {
  const { toast } = useToast();
  const { guardDemo } = useDemoMode();

  const [operators, setOperators] = useState<OperatorRow[]>([]);
  const [acksByDoc, setAcksByDoc] = useState<Record<string, AckRecord[]>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, 'all' | 'pending' | null>>({});
  const [sending, setSending] = useState<string | null>(null);   // `${docId}-${userId}`
  const [sendingAll, setSendingAll] = useState<string | null>(null); // docId

  const requiredDocs = documents.filter(d => d.is_required && d.is_visible);

  // ── Fetch operators + acknowledgments ───────────────────────────────────────
  const fetchData = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true); else setRefreshing(true);

    // Fetch operators joined with profiles and auth emails
    const { data: ops } = await supabase
      .from('operators')
      .select('id, user_id, profiles(first_name, last_name)')
      .order('created_at', { ascending: true })
      .limit(1000);

    // Fetch all auth users to get emails — done via a server-side function call
    // We call get-staff-list which returns emails, or fallback to profiles only
    const opList: OperatorRow[] = (ops ?? []).map((op: any) => {
      const profile = Array.isArray(op.profiles) ? op.profiles[0] : op.profiles;
      return {
        operator_id: op.id,
        user_id: op.user_id,
        name: [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Unknown Operator',
        email: '',
      };
    });
    setOperators(opList);

    // Fetch all acknowledgments for required docs
    if (requiredDocs.length > 0) {
      const { data: acks } = await supabase
        .from('document_acknowledgments')
        .select('document_id, user_id, document_version')
        .in('document_id', requiredDocs.map(d => d.id));

      const map: Record<string, AckRecord[]> = {};
      for (const doc of requiredDocs) {
        map[doc.id] = (acks ?? [])
          .filter((a: any) => a.document_id === doc.id && a.document_version === doc.version)
          .map((a: any) => ({ user_id: a.user_id, document_version: a.document_version }));
      }
      setAcksByDoc(map);
    }

    if (!quiet) setLoading(false); else setRefreshing(false);
  }, [requiredDocs.map(d => `${d.id}-v${d.version}`).join(',')]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Send single reminder ───────────────────────────────────────────────────
  const handleSendOne = async (doc: DriverDocument, op: OperatorRow) => {
    if (guardDemo()) return;
    const key = `${doc.id}-${op.user_id}`;
    setSending(key);

    // In-app notification
    await supabase.from('notifications').insert({
      user_id: op.user_id,
      title: `Action required: ${doc.title}`,
      body: 'Please read and acknowledge this required document in the Document Hub.',
      type: 'document_reminder',
      channel: 'in_app',
      link: '/operator?tab=docs-hub',
    });

    // Email via edge function
    const { error } = await supabase.functions.invoke('notify-document-update', {
      body: {
        event_type: 'reminder',
        document_title: doc.title,
        document_description: doc.description ?? '',
        acknowledged_user_ids: [op.user_id],
      },
    });

    setSending(null);
    if (error) {
      toast({
        title: 'In-app reminder sent, email failed',
        description: `Notified ${op.name} in-app. Email error: ${error.message}`,
      });
    } else {
      toast({
        title: 'Reminder sent ✓',
        description: `Notified ${op.name} via in-app and email.`,
      });
    }
  };

  // ── Send reminders to ALL pending for a doc ────────────────────────────────
  const handleRemindAll = async (doc: DriverDocument, pending: OperatorRow[]) => {
    setSendingAll(doc.id);

    // Batch in-app notifications
    await Promise.all(
      pending.map(op =>
        supabase.from('notifications').insert({
          user_id: op.user_id,
          title: `Action required: ${doc.title}`,
          body: 'Please read and acknowledge this required document in the Document Hub.',
          type: 'document_reminder',
          channel: 'in_app',
          link: '/operator?tab=docs-hub',
        })
      )
    );

    // Email via edge function
    const { error } = await supabase.functions.invoke('notify-document-update', {
      body: {
        event_type: 'reminder',
        document_title: doc.title,
        document_description: doc.description ?? '',
        acknowledged_user_ids: pending.map(op => op.user_id),
      },
    });

    setSendingAll(null);

    if (error) {
      toast({
        title: `In-app reminders sent, email failed`,
        description: `${pending.length} in-app notifications sent. Email error: ${error.message}`,
        variant: 'default',
      });
    } else {
      toast({
        title: 'Reminders sent ✓',
        description: `Notified ${pending.length} operator${pending.length !== 1 ? 's' : ''} via in-app and email.`,
      });
    }
  };

  // ── Compute doc compliance data ────────────────────────────────────────────
  const docRows: DocComplianceData[] = requiredDocs.map(doc => {
    const acks = acksByDoc[doc.id] ?? [];
    const ackedSet = new Set(acks.map(a => a.user_id));
    return {
      doc,
      acks,
      pending: operators.filter(op => !ackedSet.has(op.user_id)),
      acknowledged: operators.filter(op => ackedSet.has(op.user_id)),
    };
  });

  // ── Fleet-wide stats ───────────────────────────────────────────────────────
  const totalRequired = requiredDocs.length;
  const allDocsPct = totalRequired > 0 && operators.length > 0
    ? Math.round(
        docRows.reduce((sum, r) => sum + r.acknowledged.length, 0) /
        (totalRequired * operators.length) * 100
      )
    : 0;
  const fullyCompliantCount = operators.filter(op =>
    docRows.every(r => r.acknowledged.some(a => a.user_id === op.user_id))
  ).length;
  const docsWithPending = docRows.filter(r => r.pending.length > 0).length;

  const toggleExpand = (docId: string, view: 'all' | 'pending') => {
    setExpanded(e => {
      const cur = e[docId];
      return { ...e, [docId]: cur === view ? null : view };
    });
  };

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
        <div className="space-y-2">
          {[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
        </div>
      </div>
    );
  }

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (requiredDocs.length === 0) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        <ShieldCheck className="h-12 w-12 mx-auto mb-3 opacity-25" />
        <p className="font-semibold text-foreground">No required documents</p>
        <p className="text-sm mt-1">Mark documents as "Required" in the Documents tab to track acknowledgments here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* ── Summary stats ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Fleet Compliance"
          value={`${allDocsPct}%`}
          sub={`${operators.length} operator${operators.length !== 1 ? 's' : ''}`}
          color={allDocsPct === 100 ? 'text-status-complete' : allDocsPct >= 70 ? 'text-gold' : 'text-destructive'}
        />
        <StatCard
          label="Fully Compliant"
          value={fullyCompliantCount}
          sub={`of ${operators.length} operators`}
          color={fullyCompliantCount === operators.length ? 'text-status-complete' : 'text-foreground'}
        />
        <StatCard
          label="Required Docs"
          value={totalRequired}
          sub="visible & required"
        />
        <StatCard
          label="Docs with Gaps"
          value={docsWithPending}
          sub={docsWithPending > 0 ? 'need attention' : 'all complete'}
          color={docsWithPending > 0 ? 'text-destructive' : 'text-status-complete'}
        />
      </div>

      {/* ── Refresh button ─────────────────────────────────────────────────── */}
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs"
          disabled={refreshing}
          onClick={() => fetchData(true)}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* ── Per-document accordion rows ────────────────────────────────────── */}
      <div className="space-y-2">
        {docRows.map(({ doc, acks, pending, acknowledged }) => {
          const pct = operators.length > 0 ? Math.round((acknowledged.length / operators.length) * 100) : 0;
          const expandedView = expanded[doc.id];

          return (
            <div key={doc.id} className="border border-border rounded-xl overflow-hidden bg-card shadow-sm">

              {/* ── Document summary row ────────────────────────────────── */}
              <div className="flex items-center gap-3 px-4 py-3">

                {/* Progress + title */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <p className="text-sm font-semibold text-foreground truncate">{doc.title}</p>
                    <span className="text-xs text-muted-foreground shrink-0">v{doc.version}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 max-w-[160px] h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          pct === 100 ? 'bg-status-complete' : pct >= 70 ? 'bg-gold' : 'bg-destructive'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {acknowledged.length}/{operators.length} &nbsp;({pct}%)
                    </span>
                  </div>
                </div>

                {/* Status badge + actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {pending.length === 0 ? (
                    <Badge className="text-xs border bg-status-complete/10 text-status-complete border-status-complete/30 gap-1 shrink-0">
                      <CheckCircle2 className="h-3 w-3" /> All done
                    </Badge>
                  ) : (
                    <>
                      <Badge className="text-xs border bg-destructive/10 text-destructive border-destructive/30 shrink-0">
                        {pending.length} pending
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs gap-1.5"
                        disabled={sendingAll === doc.id}
                        onClick={() => handleRemindAll(doc, pending)}
                      >
                        {sendingAll === doc.id ? (
                          <><RefreshCw className="h-3 w-3 animate-spin" /> Sending…</>
                        ) : (
                          <><MailCheck className="h-3.5 w-3.5" /> Remind All</>
                        )}
                      </Button>
                    </>
                  )}

                  {/* Expand: Pending */}
                  {pending.length > 0 && (
                    <button
                      onClick={() => toggleExpand(doc.id, 'pending')}
                      title="Show pending operators"
                      className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors border ${
                        expandedView === 'pending'
                          ? 'bg-destructive/10 text-destructive border-destructive/30'
                          : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
                      }`}
                    >
                      <AlertTriangle className="h-3 w-3" />
                      {expandedView === 'pending' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>
                  )}

                  {/* Expand: All */}
                  <button
                    onClick={() => toggleExpand(doc.id, 'all')}
                    title="Show all operators"
                    className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors border ${
                      expandedView === 'all'
                        ? 'bg-secondary text-foreground border-border'
                        : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
                    }`}
                  >
                    <Users className="h-3 w-3" />
                    {expandedView === 'all' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              {/* ── Expanded: Pending operators ──────────────────────────── */}
              {expandedView === 'pending' && pending.length > 0 && (
                <div className="border-t border-border">
                  <div className="px-4 py-2 bg-destructive/5 flex items-center justify-between">
                    <p className="text-xs font-semibold text-destructive uppercase tracking-wide">
                      Pending acknowledgment ({pending.length})
                    </p>
                    <p className="text-xs text-muted-foreground">Individual reminders</p>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="text-xs h-8 pl-4">Operator</TableHead>
                        <TableHead className="text-xs h-8">Status</TableHead>
                        <TableHead className="text-xs h-8 text-right pr-4">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pending.map(op => (
                        <OperatorStatusRow
                          key={op.user_id}
                          op={op}
                          acked={false}
                          docTitle={doc.title}
                          docId={doc.id}
                          sending={sending === `${doc.id}-${op.user_id}`}
                          onSend={(o) => handleSendOne(doc, o)}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* ── Expanded: All operators ───────────────────────────────── */}
              {expandedView === 'all' && (
                <div className="border-t border-border">
                  <div className="px-4 py-2 bg-secondary/30 flex items-center justify-between">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      All operators ({operators.length})
                    </p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 text-status-complete" /> {acknowledged.length} done
                      </span>
                      {pending.length > 0 && (
                        <span className="flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3 text-destructive" /> {pending.length} pending
                        </span>
                      )}
                    </div>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="text-xs h-8 pl-4">Operator</TableHead>
                        <TableHead className="text-xs h-8">Status</TableHead>
                        <TableHead className="text-xs h-8 text-right pr-4">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {/* Pending first, then acknowledged */}
                      {[...pending.map(op => ({ op, acked: false })), ...acknowledged.map(op => ({ op, acked: true }))].map(({ op, acked }) => (
                        <OperatorStatusRow
                          key={op.user_id}
                          op={op}
                          acked={acked}
                          docTitle={doc.title}
                          docId={doc.id}
                          sending={sending === `${doc.id}-${op.user_id}`}
                          onSend={(o) => handleSendOne(doc, o)}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* ── Expanded: All done state ──────────────────────────────── */}
              {expandedView === 'all' && pending.length === 0 && operators.length > 0 && (
                <div className="border-t border-border bg-status-complete/5 px-4 py-3 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-status-complete shrink-0" />
                  <p className="text-sm text-status-complete">
                    All {operators.length} operators have acknowledged this document at the current version.
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Empty operator state ──────────────────────────────────────────── */}
      {operators.length === 0 && (
        <div className="py-10 text-center text-muted-foreground border border-dashed border-border rounded-xl">
          <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No operators onboarded yet.</p>
        </div>
      )}
    </div>
  );
}
