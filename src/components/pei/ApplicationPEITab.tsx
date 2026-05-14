import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, RefreshCw, Send, FileWarning, Eye, Copy, ShieldCheck, Plus, Pencil, X, Check, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { US_STATES } from '@/components/application/types';
import { toTitleCase } from '@/components/application/utils';
import { autoBuildPEIRequests, deletePEIRequest, fetchPEIRequestsByApplication } from '@/lib/pei/api';
import type { PEIRequest } from '@/lib/pei/types';
import { PEIStatusBadge } from './StatusBadge';
import { sendPEIEmail } from './sendPEIEmail';
import { GFEModal } from './GFEModal';
import { PEIResponseViewer } from './PEIResponseViewer';

interface Props {
  applicationId: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isReadyToSend(r: PEIRequest): boolean {
  return !!(r.employer_contact_email && EMAIL_RE.test(r.employer_contact_email) && r.employer_city && r.employer_state);
}

export function ApplicationPEITab({ applicationId }: Props) {
  const [rows, setRows] = useState<PEIRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [gfeFor, setGfeFor] = useState<{ id: string; employer: string } | null>(null);
  const [viewing, setViewing] = useState<PEIRequest | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ email: string; city: string; state: string }>({ email: '', city: '', state: '' });
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingFor, setDeletingFor] = useState<PEIRequest | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  async function handleDelete() {
    if (!deletingFor) return;
    setDeleteBusy(true);
    try {
      await deletePEIRequest(deletingFor.id);
      toast.success('PEI request deleted');
      setDeletingFor(null);
      await reload();
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to delete PEI request');
    } finally {
      setDeleteBusy(false);
    }
  }

  async function reload() {
    setLoading(true);
    try {
      setRows(await fetchPEIRequestsByApplication(applicationId));
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to load PEI requests');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [applicationId]);

  async function handleAutoBuild() {
    setBuilding(true);
    try {
      const res = await autoBuildPEIRequests(applicationId);
      if (res.gfeAuto) toast.success('No DOT-regulated employment in last 3 years — auto-GFE created.');
      else toast.success(`Created ${res.created} PEI request${res.created === 1 ? '' : 's'}.`);
      await reload();
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to build PEI requests');
    } finally {
      setBuilding(false);
    }
  }

  async function handleSend(req: PEIRequest) {
    setBusy(req.id);
    try {
      await sendPEIEmail(req.id, 'initial');
      toast.success(`PEI email queued for ${req.employer_name}`);
      await reload();
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to send');
    } finally {
      setBusy(null);
    }
  }

  function copyLink(token: string) {
    const url = `${window.location.origin}/pei/respond/${token}`;
    navigator.clipboard.writeText(url);
    toast.success('Response link copied');
  }

  function startEdit(r: PEIRequest) {
    setEditingId(r.id);
    setEdit({
      email: r.employer_contact_email ?? '',
      city: r.employer_city ?? '',
      state: r.employer_state ?? '',
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEdit({ email: '', city: '', state: '' });
  }

  async function saveEdit(r: PEIRequest) {
    const email = edit.email.trim().toLowerCase();
    const city = toTitleCase(edit.city.trim());
    const state = edit.state.trim().toUpperCase();
    if (email && !EMAIL_RE.test(email)) {
      toast.error('Enter a valid email address');
      return;
    }
    if (!city || !state) {
      toast.error('City and State are required');
      return;
    }
    setSavingEdit(true);
    try {
      // 1. Update the pei_request row
      const { error: peiErr } = await supabase
        .from('pei_requests')
        .update({
          employer_contact_email: email || null,
          employer_city: city,
          employer_state: state,
        } as any)
        .eq('id', r.id);
      if (peiErr) throw peiErr;

      // 2. Best-effort sync back to applications.employers JSONB
      const { data: app, error: appErr } = await supabase
        .from('applications')
        .select('employers')
        .eq('id', applicationId)
        .single();
      if (appErr) throw appErr;

      const employers = ((app?.employers as any[]) ?? []).slice();
      const idx = employers.findIndex(
        (e) => String(e?.name ?? e?.company_name ?? e?.employer_name ?? '').trim().toLowerCase() ===
               r.employer_name.trim().toLowerCase()
      );
      if (idx >= 0) {
        employers[idx] = { ...employers[idx], email, city, state };
        const { error: updErr } = await supabase
          .from('applications')
          .update({ employers } as any)
          .eq('id', applicationId);
        if (updErr) throw updErr;
      }

      toast.success('Employer contact updated');
      cancelEdit();
      await reload();
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to update employer');
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-gold" />Previous Employment Investigations</h3>
          <p className="text-xs text-muted-foreground mt-0.5">49 CFR §391.23 — investigate each DOT-regulated employer in the preceding 3 years.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={reload} disabled={loading}>
            <RefreshCw className="h-3 w-3 mr-1" />Refresh
          </Button>
          <Button size="sm" onClick={handleAutoBuild} disabled={building}>
            {building ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
            Auto-build from employment history
          </Button>
        </div>
      </div>

      {loading ? (
        <Card className="p-8 text-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading…</Card>
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No PEI requests yet. Click <strong>Auto-build</strong> to generate them from the applicant's employment history.
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const ready = isReadyToSend(r);
            const isEditing = editingId === r.id;
            const canEditContact = r.status === 'pending';
            const missing: string[] = [];
            if (!r.employer_contact_email) missing.push('email');
            if (!r.employer_city) missing.push('city');
            if (!r.employer_state) missing.push('state');

            return (
              <Card key={r.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{r.employer_name}</span>
                      <PEIStatusBadge status={r.status} />
                      {!ready && r.status === 'pending' && !isEditing && (
                        <span className="text-[10px] uppercase tracking-wide text-amber-700 bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300 px-1.5 py-0.5 rounded">
                          Missing {missing.join(', ')}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 space-x-3">
                      {(r.employer_city || r.employer_state) && <span>{[r.employer_city, r.employer_state].filter(Boolean).join(', ')}</span>}
                      {r.employment_start_date && <span>{r.employment_start_date} → {r.employment_end_date ?? 'present'}</span>}
                      {r.deadline_date && <span>Deadline: {r.deadline_date}</span>}
                      {r.employer_contact_email && <span>{r.employer_contact_email}</span>}
                    </div>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    {canEditContact && !isEditing && (
                      <Button size="sm" variant="ghost" onClick={() => startEdit(r)}>
                        <Pencil className="h-3 w-3 mr-1" />Edit contact
                      </Button>
                    )}
                    {r.status === 'pending' && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === r.id || !ready}
                        onClick={() => handleSend(r)}
                        title={!ready ? 'Add email, city, and state to send' : undefined}
                      >
                        {busy === r.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Send className="h-3 w-3 mr-1" />}
                        Send
                      </Button>
                    )}
                    {(r.status === 'sent' || r.status === 'follow_up_sent' || r.status === 'final_notice_sent') && (
                      <Button size="sm" variant="outline" onClick={() => copyLink(r.response_token)}>
                        <Copy className="h-3 w-3 mr-1" />Link
                      </Button>
                    )}
                    {r.status !== 'completed' && r.status !== 'gfe_documented' && (
                      <Button size="sm" variant="ghost" onClick={() => setGfeFor({ id: r.id, employer: r.employer_name })}>
                        <FileWarning className="h-3 w-3 mr-1" />GFE
                      </Button>
                    )}
                    {(r.status === 'completed' || r.status === 'gfe_documented') && (
                      <Button size="sm" variant="outline" onClick={() => setViewing(r)}>
                        <Eye className="h-3 w-3 mr-1" />View
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDeletingFor(r)}
                      className="text-destructive hover:text-destructive"
                      title="Delete PEI request"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                {isEditing && (
                  <div className="mt-3 pt-3 border-t grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                    <div className="sm:col-span-5">
                      <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Email</label>
                      <Input
                        type="email"
                        value={edit.email}
                        onChange={(e) => setEdit((s) => ({ ...s, email: e.target.value }))}
                        placeholder="hr@company.com"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="sm:col-span-4">
                      <label className="text-[11px] uppercase tracking-wide text-muted-foreground">City</label>
                      <Input
                        value={edit.city}
                        onChange={(e) => setEdit((s) => ({ ...s, city: e.target.value }))}
                        placeholder="City"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-[11px] uppercase tracking-wide text-muted-foreground">State</label>
                      <select
                        value={edit.state}
                        onChange={(e) => setEdit((s) => ({ ...s, state: e.target.value }))}
                        className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                      >
                        <option value="">—</option>
                        {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="sm:col-span-1 flex gap-1 justify-end">
                      <Button size="sm" variant="ghost" onClick={cancelEdit} disabled={savingEdit}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" onClick={() => saveEdit(r)} disabled={savingEdit}>
                        {savingEdit ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {gfeFor && (
        <GFEModal
          open
          requestId={gfeFor.id}
          employerName={gfeFor.employer}
          onClose={() => setGfeFor(null)}
          onDone={() => { setGfeFor(null); reload(); }}
        />
      )}
      <PEIResponseViewer open={!!viewing} request={viewing} onClose={() => setViewing(null)} />

      <AlertDialog open={!!deletingFor} onOpenChange={(o) => { if (!o) setDeletingFor(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete PEI record?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the request for{' '}
              <strong>{deletingFor?.employer_name}</strong>
              {(deletingFor?.status === 'completed' || deletingFor?.status === 'gfe_documented')
                ? ' and any submitted response or accident records.'
                : '.'}{' '}
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
              disabled={deleteBusy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}