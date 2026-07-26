import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2, Send } from 'lucide-react';

interface OperatorOption {
  id: string;
  name: string;
  email: string;
  unit_number: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-select a driver when opened from the authorizations list. */
  initialOperatorId?: string | null;
  /** Called after a request is successfully sent. */
  onSent?: () => void;
}

export default function SendPassengerAuthModal({ open, onOpenChange, initialOperatorId, onSent }: Props) {
  const [operators, setOperators] = useState<OperatorOption[]>([]);
  const [operatorId, setOperatorId] = useState<string>('');
  const [driverName, setDriverName] = useState('');
  const [unitNumber, setUnitNumber] = useState('');
  const [driverEmail, setDriverEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [conflict, setConflict] = useState<{ id: string; createdAt: string }[] | null>(null);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase
        .from('operators')
        .select('id, unit_number, is_active, applications:application_id ( first_name, last_name, email )')
        .eq('is_active', true)
        .order('unit_number', { ascending: true });
      const rows = (data ?? []).map((r: any) => {
        const app = r.applications;
        const name = [app?.first_name, app?.last_name].filter(Boolean).join(' ') || 'Driver';
        return {
          id: r.id as string,
          name,
          email: (app?.email as string) || '',
          unit_number: (r.unit_number as string) || null,
        };
      }).filter(r => r.email);
      setOperators(rows);
    })();
  }, [open]);

  useEffect(() => {
    if (open && initialOperatorId) setOperatorId(initialOperatorId);
  }, [open, initialOperatorId]);

  useEffect(() => {
    if (!operatorId) return;
    const op = operators.find(o => o.id === operatorId);
    if (op) {
      setDriverName(op.name);
      setDriverEmail(op.email);
      setUnitNumber(op.unit_number || '');
    }
  }, [operatorId, operators]);

  const reset = () => {
    setOperatorId(''); setDriverName(''); setUnitNumber(''); setDriverEmail(''); setConflict(null);
  };

  const send = async (opts?: { replaceExisting?: boolean }) => {
    if (!driverName.trim() || !unitNumber.trim() || !driverEmail.trim()) {
      toast.error('Driver name, unit number, and email are required.');
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-passenger-auth', {
        body: {
          operatorId: operatorId || null,
          driverName: driverName.trim(),
          unitNumber: unitNumber.trim(),
          driverEmail: driverEmail.trim(),
          replaceExisting: !!opts?.replaceExisting,
        },
      });
      if ((data as any)?.error === 'pending_request_exists') {
        setConflict(((data as any).pending ?? []).map((p: any) => ({ id: p.id, createdAt: p.createdAt })));
        return;
      }
      if (error || !data?.id) throw new Error((data as any)?.error || error?.message || 'Send failed');
      toast.success(`Passenger Authorization sent to ${driverEmail}`);
      reset();
      onSent?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || 'Send failed');
    } finally {
      setSending(false);
    }
  };

  const resendExisting = async () => {
    const target = conflict?.[0];
    if (!target) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-passenger-auth', {
        body: { resendId: target.id },
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message);
      toast.success(`Existing link re-sent to ${driverEmail}`);
      reset();
      onSent?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || 'Could not resend');
    } finally {
      setSending(false);
    }
  };

  const fmtDate = (d: string) => {
    const dt = new Date(d);
    return Number.isNaN(dt.getTime())
      ? ''
      : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Send Passenger Authorization</DialogTitle>
        </DialogHeader>
        {conflict ? (
          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
              <p className="text-sm font-medium text-foreground">
                {driverName} already has an open request
                {conflict[0]?.createdAt ? ` from ${fmtDate(conflict[0].createdAt)}` : ''} that
                hasn&rsquo;t been signed.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Sending another would stack a second task on their home screen. Re-send the
                existing link, or replace it with a fresh request (the old one is cancelled).
                {conflict.length > 1 && ` ${conflict.length} open requests will be cancelled if you replace.`}
              </p>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="ghost" onClick={() => setConflict(null)} disabled={sending}>Back</Button>
              <Button variant="outline" onClick={resendExisting} disabled={sending}>
                Resend existing link
              </Button>
              <Button onClick={() => send({ replaceExisting: true })} disabled={sending}>
                {sending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Working…</> : 'Replace with new request'}
              </Button>
            </DialogFooter>
          </div>
        ) : (
        <>
        <div className="space-y-4 py-2">
          <div>
            <Label>Contractor / Driver</Label>
            <Select value={operatorId} onValueChange={setOperatorId}>
              <SelectTrigger><SelectValue placeholder="Select a driver (or fill in manually below)" /></SelectTrigger>
              <SelectContent>
                {operators.map(o => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.unit_number ? `Unit ${o.unit_number} — ` : ''}{o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Driver name *</Label>
              <Input value={driverName} onChange={e => setDriverName(e.target.value)} />
            </div>
            <div>
              <Label>Unit number *</Label>
              <Input value={unitNumber} onChange={e => setUnitNumber(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Driver email *</Label>
            <Input type="email" value={driverEmail} onChange={e => setDriverEmail(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">
            The driver will get an in-app task in SUPERDRIVE <strong>and</strong> an email link
            to complete the Passenger Authorization and sign the form. The in-app task requires
            a linked driver profile (select one above). Carrier signature and Driver Hub filing
            happen automatically.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => send()} disabled={sending}>
            {sending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending…</> : <><Send className="h-4 w-4 mr-2" />Send email</>}
          </Button>
        </DialogFooter>
        </>
        )}
      </DialogContent>
    </Dialog>
  );
}