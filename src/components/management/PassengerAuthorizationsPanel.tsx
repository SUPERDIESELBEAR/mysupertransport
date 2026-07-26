import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { FileText, Loader2, RotateCw, Search, Send, X } from 'lucide-react';

export interface PassengerAuthRow {
  id: string;
  operator_id: string | null;
  driver_name: string;
  unit_number: string | null;
  driver_email: string;
  status: string;
  passenger_name: string | null;
  sent_at: string | null;
  executed_at: string | null;
  expires_at: string | null;
  executed_pdf_url: string | null;
  created_at: string;
}

const PENDING = ['sent', 'opened'];

function fmt(d: string | null) {
  if (!d) return '—';
  const iso = d.length <= 10 ? `${d}T12:00:00` : d;
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const dt = new Date(`${date.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(dt.getTime())) return null;
  return Math.round((dt.getTime() - Date.now()) / 86400000);
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    sent: { label: 'Sent', className: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30' },
    opened: { label: 'Opened', className: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30' },
    signed: { label: 'Signed', className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30' },
    filed: { label: 'Signed & filed', className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30' },
    revoked: { label: 'Cancelled', className: 'bg-muted text-muted-foreground border-border' },
  };
  const s = map[status] ?? { label: status, className: 'bg-muted text-muted-foreground border-border' };
  return <Badge variant="outline" className={s.className}>{s.label}</Badge>;
}

interface Props {
  /** Opens the send dialog, optionally pre-selecting a driver. */
  onSendNew: (operatorId?: string | null) => void;
  /** Bumped by the parent after a successful send to force a refresh. */
  refreshKey?: number;
}

export default function PassengerAuthorizationsPanel({ onSendNew, refreshKey = 0 }: Props) {
  const [rows, setRows] = useState<PassengerAuthRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<PassengerAuthRow | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('passenger_authorizations')
      .select('id, operator_id, driver_name, unit_number, driver_email, status, passenger_name, sent_at, executed_at, expires_at, executed_pdf_url, created_at')
      .order('created_at', { ascending: false });
    if (error) toast.error('Could not load Passenger Authorizations');
    setRows((data ?? []) as PassengerAuthRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      [r.driver_name, r.unit_number, r.passenger_name, r.driver_email, r.status]
        .filter(Boolean).some(v => String(v).toLowerCase().includes(q)),
    );
  }, [rows, search]);

  const pendingCount = rows.filter(r => PENDING.includes(r.status)).length;

  const resend = async (row: PassengerAuthRow) => {
    setBusyId(row.id);
    try {
      const { data, error } = await supabase.functions.invoke('send-passenger-auth', {
        body: { resendId: row.id },
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message);
      toast.success(`Link re-sent to ${row.driver_email}`);
      load();
    } catch (e: any) {
      toast.error(e?.message || 'Could not resend');
    } finally {
      setBusyId(null);
    }
  };

  const revoke = async (row: PassengerAuthRow) => {
    setBusyId(row.id);
    try {
      const { data, error } = await supabase.functions.invoke('revoke-passenger-auth', {
        body: { id: row.id },
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message);
      toast.success('Request cancelled — the driver’s task has been removed.');
      load();
    } catch (e: any) {
      toast.error(e?.message || 'Could not cancel');
    } finally {
      setBusyId(null);
      setConfirmRevoke(null);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center gap-3 p-4 border-b border-border">
        <div className="flex-1 min-w-48">
          <div className="font-semibold text-foreground">Passenger Authorizations</div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {pendingCount} pending · {rows.length} total. Drivers may hold multiple signed
            authorizations, but only one open request at a time.
          </p>
        </div>
        <div className="relative w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search driver, unit, passenger…"
            className="pl-9 h-9"
          />
        </div>
        <Button size="sm" onClick={() => onSendNew(null)} className="shrink-0">
          <Send className="h-4 w-4 mr-1.5" /> Send new
        </Button>
      </div>

      {loading ? (
        <div className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-6 text-sm text-muted-foreground">No Passenger Authorizations yet.</div>
      ) : (
        <ul className="divide-y divide-border">
          {filtered.map(r => {
            const isPending = PENDING.includes(r.status);
            const isSigned = r.status === 'signed' || r.status === 'filed';
            const dLeft = isSigned ? daysUntil(r.expires_at) : null;
            const expiringSoon = dLeft !== null && dLeft <= 60;
            const busy = busyId === r.id;
            return (
              <li key={r.id} className="p-4 flex flex-wrap items-start gap-3">
                <div className="flex-1 min-w-56">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-foreground">
                      {r.unit_number ? `Unit ${r.unit_number} — ` : ''}{r.driver_name}
                    </span>
                    <StatusBadge status={r.status} />
                    {expiringSoon && (
                      <Badge variant="outline" className="bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30">
                        {dLeft !== null && dLeft < 0 ? 'Expired' : `Expires in ${dLeft}d`}
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Passenger: {r.passenger_name || '—'} · Sent {fmt(r.sent_at ?? r.created_at)}
                    {isSigned && ` · Signed ${fmt(r.executed_at)} · Expires ${fmt(r.expires_at)}`}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {isPending && (
                    <>
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => resend(r)}>
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><RotateCw className="h-4 w-4 mr-1.5" />Resend</>}
                      </Button>
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmRevoke(r)}>
                        <X className="h-4 w-4 mr-1.5" />Cancel
                      </Button>
                    </>
                  )}
                  {isSigned && r.executed_pdf_url && (
                    <Button size="sm" variant="outline" asChild>
                      <a href={r.executed_pdf_url} target="_blank" rel="noreferrer">
                        <FileText className="h-4 w-4 mr-1.5" />View PDF
                      </a>
                    </Button>
                  )}
                  {isSigned && (
                    <Button size="sm" variant="ghost" onClick={() => onSendNew(r.operator_id)}>
                      <Send className="h-4 w-4 mr-1.5" />
                      {expiringSoon ? 'Send renewal' : 'Send new'}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <AlertDialog open={!!confirmRevoke} onOpenChange={v => { if (!v) setConfirmRevoke(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this request?</AlertDialogTitle>
            <AlertDialogDescription>
              The link stops working and the task disappears from{' '}
              {confirmRevoke?.driver_name}&rsquo;s home screen. The record stays here as
              cancelled for your audit trail. Signed authorizations are never affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmRevoke && revoke(confirmRevoke)}>
              Cancel request
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}