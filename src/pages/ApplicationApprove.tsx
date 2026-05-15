import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { formatValue, getFieldDef } from '@/lib/applicationCorrections';

interface CorrectionData {
  request_id: string;
  application_id: string;
  applicant_first_name: string | null;
  applicant_last_name: string | null;
  requested_by_staff_name: string | null;
  reason_for_changes: string;
  courtesy_message: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'expired';
  sent_at: string;
  expires_at: string;
  fields: { id: string; field_path: string; field_label: string; old_value: unknown; new_value: unknown; }[];
}

export default function ApplicationApprove() {
  const { token = '' } = useParams<{ token: string }>();
  const [data, setData] = useState<CorrectionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signedName, setSignedName] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<'approved' | 'rejected' | null>(null);
  const sigCanvas = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);

  useEffect(() => {
    (async () => {
      const { data: rows, error: err } = await supabase.rpc('get_application_correction_by_token', { p_token: token });
      if (err || !rows || (rows as unknown[]).length === 0) {
        setError('This correction link is invalid or has been removed.');
      } else {
        setData((rows as CorrectionData[])[0]);
      }
      setLoading(false);
    })();
  }, [token]);

  // Simple signature pad
  useEffect(() => {
    const c = sigCanvas.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#0D0D0D';
    const pos = (e: PointerEvent) => { const r = c.getBoundingClientRect(); return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) }; };
    const down = (e: PointerEvent) => { drawing.current = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
    const move = (e: PointerEvent) => { if (!drawing.current) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); };
    const up = () => { drawing.current = false; };
    c.addEventListener('pointerdown', down); c.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { c.removeEventListener('pointerdown', down); c.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [data]);

  const clearSig = () => { const c = sigCanvas.current; if (!c) return; const ctx = c.getContext('2d'); ctx?.clearRect(0,0,c.width,c.height); };

  const submit = async (action: 'approve' | 'reject') => {
    if (action === 'approve' && signedName.trim().length < 2) {
      toast.error('Please type your full name to sign.');
      return;
    }
    setSubmitting(true);
    try {
      let signatureUrl: string | null = null;
      if (action === 'approve' && sigCanvas.current) {
        signatureUrl = sigCanvas.current.toDataURL('image/png');
      }
      const { error: err } = await supabase.functions.invoke('respond-application-correction', {
        body: {
          token,
          action,
          signed_name: signedName.trim(),
          signature_url: signatureUrl,
          rejection_reason: rejectReason.trim(),
        },
      });
      if (err) throw err;
      setDone(action === 'approve' ? 'approved' : 'rejected');
    } catch (err) {
      toast.error((err as { message?: string })?.message || 'Submission failed');
    } finally { setSubmitting(false); }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  if (error || !data) return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md text-center"><AlertTriangle className="h-10 w-10 mx-auto text-amber-500 mb-3" /><h1 className="text-xl font-bold mb-2">Link unavailable</h1><p className="text-sm text-muted-foreground">{error || 'Not found.'}</p></div>
    </div>
  );

  const fullName = [data.applicant_first_name, data.applicant_last_name].filter(Boolean).join(' ');

  if (done) return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-secondary/30">
      <div className="max-w-md text-center bg-white rounded-lg shadow p-8">
        {done === 'approved' ? <CheckCircle2 className="h-12 w-12 mx-auto text-emerald-500 mb-3" /> : <XCircle className="h-12 w-12 mx-auto text-rose-500 mb-3" />}
        <h1 className="text-xl font-bold mb-2">{done === 'approved' ? 'Approved — thank you' : 'Changes rejected'}</h1>
        <p className="text-sm text-muted-foreground">
          {done === 'approved'
            ? 'Your e-signature has been recorded and the corrections are now applied to your application.'
            : 'We\'ve let our team know. They will reach out if any next steps are needed.'}
        </p>
      </div>
    </div>
  );

  if (data.status !== 'pending') return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md text-center"><AlertTriangle className="h-10 w-10 mx-auto text-amber-500 mb-3" /><h1 className="text-xl font-bold mb-2">No longer active</h1><p className="text-sm text-muted-foreground">This correction request has been {data.status}.</p></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-secondary/30 p-4 md:p-8">
      <div className="max-w-3xl mx-auto bg-white rounded-lg shadow">
        <div className="border-b border-border p-5">
          <h1 className="text-xl font-bold text-foreground">Approve corrections to your application</h1>
          <p className="text-sm text-muted-foreground mt-1">Hi {fullName || 'there'} — {data.requested_by_staff_name || 'our team'} has prepared the following changes for your approval.</p>
        </div>

        <div className="p-5 space-y-5">
          <div className="bg-amber-50 border-l-4 border-amber-400 rounded p-3">
            <div className="text-xs font-bold text-amber-900 uppercase tracking-wide mb-1">Reason for changes</div>
            <p className="text-sm text-foreground whitespace-pre-wrap">{data.reason_for_changes}</p>
            {data.courtesy_message && <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{data.courtesy_message}</p>}
          </div>

          <div>
            <h2 className="text-sm font-bold text-foreground mb-2">Proposed changes ({data.fields.length})</h2>
            <div className="border border-border rounded overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40"><tr><th className="text-left p-2 text-xs font-semibold uppercase tracking-wide">Field</th><th className="text-left p-2 text-xs font-semibold uppercase tracking-wide">Current</th><th className="text-left p-2 text-xs font-semibold uppercase tracking-wide">Proposed</th></tr></thead>
                <tbody>
                  {data.fields.map((f) => {
                    const def = getFieldDef(f.field_path);
                    return (
                      <tr key={f.id} className="border-t border-border">
                        <td className="p-2 font-medium align-top">{f.field_label}</td>
                        <td className="p-2 text-muted-foreground line-through align-top break-words">{formatValue(f.old_value, def?.kind)}</td>
                        <td className="p-2 text-emerald-700 font-semibold align-top break-words">{formatValue(f.new_value, def?.kind)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {!showReject ? (
            <>
              <div className="border border-border rounded p-4 space-y-3">
                <h3 className="text-sm font-bold">Approve & sign</h3>
                <div>
                  <label className="text-xs font-semibold mb-1 block">Type your full legal name</label>
                  <Input value={signedName} onChange={(e) => setSignedName(e.target.value)} placeholder={fullName || 'Your full name'} />
                </div>
                <div>
                  <label className="text-xs font-semibold mb-1 block">Sign below</label>
                  <canvas ref={sigCanvas} width={600} height={140} className="border border-border rounded bg-white w-full touch-none" />
                  <button type="button" onClick={clearSig} className="text-xs text-muted-foreground underline mt-1">Clear</button>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button onClick={() => submit('approve')} disabled={submitting} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white">
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />} Approve & sign
                  </Button>
                  <Button variant="outline" onClick={() => setShowReject(true)} disabled={submitting}>Reject</Button>
                </div>
              </div>
            </>
          ) : (
            <div className="border border-border rounded p-4 space-y-3">
              <h3 className="text-sm font-bold">Reject these changes</h3>
              <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} placeholder="Optional: tell us why so we can follow up." maxLength={500} />
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowReject(false)} disabled={submitting}>Back</Button>
                <Button onClick={() => submit('reject')} disabled={submitting} className="flex-1 bg-rose-600 hover:bg-rose-700 text-white">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4 mr-2" />} Confirm reject
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}