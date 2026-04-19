import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { formatMoney, getWorkWeekFor, formatShortDay, toDateStr } from '@/lib/settlementMath';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  operatorId: string;
  payPercentage: number;
  defaultDate?: string;
  onSaved: () => void;
}

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
];

export default function AddLoadModal({ open, onOpenChange, operatorId, payPercentage, defaultDate, onSaved }: Props) {
  const today = toDateStr(new Date());
  const [deliveryDate, setDeliveryDate] = useState(defaultDate ?? today);
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [rateInput, setRateInput] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDeliveryDate(defaultDate ?? today);
      setCity('');
      setState('');
      setRateInput('');
    }
  }, [open, defaultDate, today]);

  const rate = parseFloat(rateInput || '0');
  const net = isNaN(rate) ? 0 : rate * (payPercentage / 100);
  const week = deliveryDate ? getWorkWeekFor(deliveryDate) : null;

  const canSave = !!deliveryDate && !isNaN(rate) && rate > 0;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    const { error } = await supabase.from('forecast_loads').insert({
      operator_id: operatorId,
      delivery_date: deliveryDate,
      delivery_city: city.trim() || null,
      delivery_state: state || null,
      load_rate: rate,
    });
    setSaving(false);
    if (error) {
      toast({ title: 'Could not save load', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Load added' });
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Load</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="delivery_date">Delivery date *</Label>
            <Input
              id="delivery_date"
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
            />
            {week && (
              <p className="text-xs text-muted-foreground">
                Will appear on payday <strong>{formatShortDay(week.payday)}</strong>
              </p>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="city">City</Label>
              <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Memphis" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="state">State</Label>
              <select
                id="state"
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">—</option>
                {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rate">Load rate (gross) *</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
              <Input
                id="rate"
                type="number"
                step="0.01"
                min="0"
                value={rateInput}
                onChange={(e) => setRateInput(e.target.value)}
                placeholder="2000.00"
                className="pl-7"
                inputMode="decimal"
              />
            </div>
            {rate > 0 && (
              <p className="text-xs text-muted-foreground">
                Your share at {payPercentage}%: <strong className="text-foreground">{formatMoney(net)}</strong>
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={!canSave || saving}>{saving ? 'Saving…' : 'Add Load'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
