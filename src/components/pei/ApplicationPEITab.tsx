import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, RefreshCw, Send, FileWarning, Eye, Copy, ShieldCheck, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { autoBuildPEIRequests, fetchPEIRequestsByApplication } from '@/lib/pei/api';
import type { PEIRequest } from '@/lib/pei/types';
import { PEIStatusBadge } from './StatusBadge';
import { sendPEIEmail } from './sendPEIEmail';
import { GFEModal } from './GFEModal';
import { PEIResponseViewer } from './PEIResponseViewer';

interface Props {
  applicationId: string;
}

export function ApplicationPEITab({ applicationId }: Props) {
  const [rows, setRows] = useState<PEIRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [gfeFor, setGfeFor] = useState<{ id: string; employer: string } | null>(null);
  const [viewing, setViewing] = useState<PEIRequest | null>(null);

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
          {rows.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{r.employer_name}</span>
                    <PEIStatusBadge status={r.status} />
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 space-x-3">
                    {(r.employer_city || r.employer_state) && <span>{[r.employer_city, r.employer_state].filter(Boolean).join(', ')}</span>}
                    {r.employment_start_date && <span>{r.employment_start_date} → {r.employment_end_date ?? 'present'}</span>}
                    {r.deadline_date && <span>Deadline: {r.deadline_date}</span>}
                    {r.employer_contact_email && <span>{r.employer_contact_email}</span>}
                  </div>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  {r.status === 'pending' && (
                    <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => handleSend(r)}>
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
                </div>
              </div>
            </Card>
          ))}
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
    </div>
  );
}