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
}

export default function SendPassengerAuthModal({ open, onOpenChange }: Props) {
  const [operators, setOperators] = useState<OperatorOption[]>([]);
  const [operatorId, setOperatorId] = useState<string>('');
  const [driverName, setDriverName] = useState('');
  const [unitNumber, setUnitNumber] = useState('');
  const [driverEmail, setDriverEmail] = useState('');
  const [sending, setSending] = useState(false);

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
    if (!operatorId) return;
    const op = operators.find(o => o.id === operatorId);
    if (op) {
      setDriverName(op.name);
      setDriverEmail(op.email);
      setUnitNumber(op.unit_number || '');
    }
  }, [operatorId, operators]);

  const reset = () => {
    setOperatorId(''); setDriverName(''); setUnitNumber(''); setDriverEmail('');
  };

  const send = async () => {
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
        },
      });
      if (error || !data?.id) throw new Error((data as any)?.error || error?.message || 'Send failed');
      toast.success(`Passenger Authorization sent to ${driverEmail}`);
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || 'Send failed');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Send Passenger Authorization</DialogTitle>
        </DialogHeader>
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
            The driver will receive an email link to complete Authorization #1 and sign the form.
            The carrier signature and Driver Hub filing happen automatically.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={send} disabled={sending}>
            {sending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending…</> : <><Send className="h-4 w-4 mr-2" />Send email</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}