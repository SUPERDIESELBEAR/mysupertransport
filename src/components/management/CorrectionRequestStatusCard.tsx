import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, X, Mail, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { formatValue, getFieldDef } from '@/lib/applicationCorrections';

interface Props { applicationId: string; onChanged?: () => void; }

interface Row {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'expired';
  reason_for_changes: string;
  requested_by_staff_name: string | null;
  sent_at: string;
  responded_at: string | null;
  expires_at: string;
  signed_typed_name: string | null;
  signed_ip: string | null;
  rejection_reason: string | null;
  application_correction_fields: { id: string; field_path: string; field_label: string; old_value: unknown; new_value: unknown; }[];
}

export function CorrectionRequestStatusCard({ applicationId, onChanged }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('application_correction_requests')
      .select('id, status, reason_for_changes, requested_by_staff_name, sent_at, responded_at, expires_at, signed_typed_name, signed_ip, rejection_reason, application_correction_fields(id, field_path, field_label, old_value, new_value)')
      .eq('application_id', applicationId)
      .order('sent_at', { ascending: false })
      .limit(5);
    setRows((data ?? []) as unknown as Row[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [applicationId]);

  const cancel = async (id: string) => {
    setBusyId(id);
    const { error } = await supabase.rpc('cancel_application_correction', { p_request_id: id });
    setBusyId(null);
    if (error) { toast.error(error.message || 'Cancel failed'); return; }
    toast.success('Correction request cancelled.');
    load(); onChanged?.();
  };

  const resendEmail = async (id: string) => {
    setBusyId(id);
    const { error } = await supabase.functions.invoke('send-application-correction-email', { body: { requestId: id } });
    setBusyId(null);
    if (error) { toast.error('Email failed'); return; }
    toast.success('Email re-sent.');
  };

  if (loading) return null;
  if (rows.length === 0) return null;

  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const palette = r.status === 'pending' ? 'bg-amber-50 border-amber-200 text-amber-900'
          : r.status === 'approved' ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
          : r.status === 'rejected' ? 'bg-rose-50 border-rose-200 text-rose-900'
          : 'bg-muted border-border text-muted-foreground';
        const Icon = r.status === 'pending' ? Clock : r.status === 'approved' ? CheckCircle2 : r.status === 'rejected' ? XCircle : X;
        return (
          <div key={r.id} className={`rounded-lg border p-3 ${palette}`}>
            <div className="flex items-start gap-2">
              <Icon className="h-4 w-4 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-[10px] uppercase">{r.status}</Badge>
                  <span className="text-xs">
                    {r.application_correction_fields.length} field{r.application_correction_fields.length === 1 ? '' : 's'} · sent by {r.requested_by_staff_name || 'staff'} · {new Date(r.sent_at).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} CT
                  </span>
                </div>
                <div className="text-xs"><strong>Reason:</strong> {r.reason_for_changes}</div>
                <details className="text-xs">
                  <summary className="cursor-pointer">View {r.application_correction_fields.length} change(s)</summary>
                  <ul className="mt-1.5 space-y-1 pl-3">
                    {r.application_correction_fields.map((f) => {
                      const def = getFieldDef(f.field_path);
                      return (
                        <li key={f.id}>
                          <strong>{f.field_label}:</strong>{' '}
                          <span className="line-through opacity-60">{formatValue(f.old_value, def?.kind)}</span>
                          {' → '}
                          <span className="font-semibold">{formatValue(f.new_value, def?.kind)}</span>
                        </li>
                      );
                    })}
                  </ul>
                </details>
                {r.status === 'approved' && r.signed_typed_name && (
                  <div className="text-xs">Signed by {r.signed_typed_name} · {r.responded_at ? new Date(r.responded_at).toLocaleString('en-US', { timeZone: 'America/Chicago' }) : ''}{r.signed_ip ? ` · IP ${r.signed_ip}` : ''}</div>
                )}
                {r.status === 'rejected' && r.rejection_reason && (
                  <div className="text-xs"><strong>Applicant reason:</strong> {r.rejection_reason}</div>
                )}
                {r.status === 'pending' && (
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" variant="outline" disabled={busyId === r.id} onClick={() => resendEmail(r.id)}>
                      {busyId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3 mr-1" />} Resend email
                    </Button>
                    <Button size="sm" variant="outline" disabled={busyId === r.id} onClick={() => cancel(r.id)}>
                      <X className="h-3 w-3 mr-1" /> Cancel request
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}