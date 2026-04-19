import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { getWorkWeekFor, formatShortDay, toDateStr } from '@/lib/settlementMath';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  operatorId: string;
  expenseType: 'fuel' | 'advance';
  defaultDate?: string;
  onSaved: () => void;
}

const LABELS: Record<'fuel' | 'advance', { title: string; field: string; placeholder: string }> = {
  fuel:    { title: 'Add Fuel Purchase',  field: 'Fuel amount',     placeholder: '620.00' },
  advance: { title: 'Add Cash Advance',   field: 'Advance amount',  placeholder: '300.00' },
};

export default function AddExpenseModal({ open, onOpenChange, operatorId, expenseType, defaultDate, onSaved }: Props) {
  const today = toDateStr(new Date());
  const [date, setDate] = useState(defaultDate ?? today);
  const [amountInput, setAmountInput] = useState('');
  const [saving, setSaving] = useState(false);
  const cfg = LABELS[expenseType];

  useEffect(() => {
    if (open) {
      setDate(defaultDate ?? today);
      setAmountInput('');
    }
  }, [open, defaultDate, today]);

  const amount = parseFloat(amountInput || '0');
  const week = date ? getWorkWeekFor(date) : null;
  const canSave = !!date && !isNaN(amount) && amount > 0;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    const { error } = await supabase.from('forecast_expenses').insert({
      operator_id: operatorId,
      expense_date: date,
      expense_type: expenseType,
      amount,
    });
    setSaving(false);
    if (error) {
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: expenseType === 'fuel' ? 'Fuel added' : 'Advance added' });
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{cfg.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="exp_date">Date *</Label>
            <Input
              id="exp_date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            {week && (
              <p className="text-xs text-muted-foreground">
                Will deduct from payday <strong>{formatShortDay(week.payday)}</strong>
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="amount">{cfg.field} *</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                placeholder={cfg.placeholder}
                className="pl-7"
                inputMode="decimal"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={!canSave || saving}>{saving ? 'Saving…' : 'Add'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
