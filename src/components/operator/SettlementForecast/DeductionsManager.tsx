import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Trash2, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import {
  buildInstallmentPaydays,
  formatMoney,
  formatShortDay,
  getUpcomingPaydays,
  splitInstallments,
  toDateStr,
} from '@/lib/settlementMath';

type Deduction = {
  id: string;
  label: string;
  payday_date: string;
  amount: number;
  group_id: string | null;
  installment_number: number | null;
  installment_total: number | null;
};

type GroupedRepair = {
  group_id: string;
  label: string;
  total: number;
  installments: Deduction[];
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  operatorId: string;
  onSaved: () => void;
}

export default function DeductionsManager({ open, onOpenChange, operatorId, onSaved }: Props) {
  const [tab, setTab] = useState<'list' | 'repair' | 'oneoff'>('list');
  const [deductions, setDeductions] = useState<Deduction[]>([]);
  const [loading, setLoading] = useState(false);

  // Repair form
  const [repairLabel, setRepairLabel] = useState('');
  const [repairTotal, setRepairTotal] = useState('');
  const [repairCount, setRepairCount] = useState('3');
  const [repairFirstPayday, setRepairFirstPayday] = useState('');

  // One-off form
  const [oneoffLabel, setOneoffLabel] = useState('');
  const [oneoffAmount, setOneoffAmount] = useState('');
  const [oneoffPayday, setOneoffPayday] = useState('');

  const upcoming = getUpcomingPaydays(8);

  const loadDeductions = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('forecast_deductions')
      .select('id, label, payday_date, amount, group_id, installment_number, installment_total')
      .eq('operator_id', operatorId)
      .gte('payday_date', toDateStr(new Date()))
      .order('payday_date', { ascending: true });
    setLoading(false);
    if (error) {
      toast({ title: 'Could not load deductions', description: error.message, variant: 'destructive' });
      return;
    }
    setDeductions((data ?? []).map((d) => ({ ...d, amount: Number(d.amount) })));
  };

  useEffect(() => {
    if (open) {
      loadDeductions();
      setTab('list');
      setRepairLabel(''); setRepairTotal(''); setRepairCount('3');
      setRepairFirstPayday(upcoming[0]?.payday ?? '');
      setOneoffLabel(''); setOneoffAmount('');
      setOneoffPayday(upcoming[0]?.payday ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, operatorId]);

  // Group installments by group_id
  const grouped: GroupedRepair[] = (() => {
    const map = new Map<string, GroupedRepair>();
    const standalone: Deduction[] = [];
    for (const d of deductions) {
      if (d.group_id) {
        const existing = map.get(d.group_id);
        if (existing) {
          existing.total += d.amount;
          existing.installments.push(d);
        } else {
          map.set(d.group_id, {
            group_id: d.group_id,
            label: d.label,
            total: d.amount,
            installments: [d],
          });
        }
      } else {
        standalone.push(d);
      }
    }
    const groups = Array.from(map.values());
    groups.forEach((g) => g.installments.sort((a, b) => a.payday_date.localeCompare(b.payday_date)));
    // Append standalone as "groups" of 1 for display uniformity
    standalone.forEach((d) => {
      groups.push({ group_id: d.id, label: d.label, total: d.amount, installments: [d] });
    });
    return groups.sort((a, b) => a.installments[0].payday_date.localeCompare(b.installments[0].payday_date));
  })();

  const saveRepair = async () => {
    const total = parseFloat(repairTotal || '0');
    const count = parseInt(repairCount || '0', 10);
    if (!repairLabel.trim() || isNaN(total) || total <= 0 || isNaN(count) || count < 1 || !repairFirstPayday) {
      toast({ title: 'Fill in all repair fields', variant: 'destructive' });
      return;
    }
    const amounts = splitInstallments(total, count);
    const paydays = buildInstallmentPaydays(repairFirstPayday, count);
    const groupId = crypto.randomUUID();
    const rows = amounts.map((amt, i) => ({
      operator_id: operatorId,
      label: repairLabel.trim(),
      payday_date: paydays[i],
      amount: amt,
      group_id: groupId,
      installment_number: i + 1,
      installment_total: count,
    }));
    const { error } = await supabase.from('forecast_deductions').insert(rows);
    if (error) {
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: `Repair scheduled across ${count} paydays` });
    onSaved();
    setRepairLabel(''); setRepairTotal(''); setRepairCount('3');
    setTab('list');
    loadDeductions();
  };

  const saveOneoff = async () => {
    const amount = parseFloat(oneoffAmount || '0');
    if (!oneoffLabel.trim() || isNaN(amount) || amount <= 0 || !oneoffPayday) {
      toast({ title: 'Fill in all fields', variant: 'destructive' });
      return;
    }
    const { error } = await supabase.from('forecast_deductions').insert({
      operator_id: operatorId,
      label: oneoffLabel.trim(),
      payday_date: oneoffPayday,
      amount,
    });
    if (error) {
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Deduction added' });
    onSaved();
    setOneoffLabel(''); setOneoffAmount('');
    setTab('list');
    loadDeductions();
  };

  const deleteGroup = async (group: GroupedRepair) => {
    if (!confirm(`Delete "${group.label}"${group.installments.length > 1 ? ` (${group.installments.length} installments)` : ''}?`)) return;
    const ids = group.installments.map((d) => d.id);
    const { error } = await supabase.from('forecast_deductions').delete().in('id', ids);
    if (error) {
      toast({ title: 'Could not delete', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Deleted' });
    onSaved();
    loadDeductions();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Repair Payback & Other Deductions</DialogTitle>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="list">Scheduled</TabsTrigger>
            <TabsTrigger value="repair"><Plus className="h-3 w-3 mr-1" />Repair</TabsTrigger>
            <TabsTrigger value="oneoff"><Plus className="h-3 w-3 mr-1" />One-off</TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="space-y-2 pt-2">
            {loading && <p className="text-sm text-muted-foreground py-4 text-center">Loading…</p>}
            {!loading && grouped.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No upcoming deductions. Use the tabs above to schedule a repair or one-off item.
              </p>
            )}
            {grouped.map((g) => (
              <div key={g.group_id} className="border rounded-md p-3 bg-muted/30">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{g.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Total {formatMoney(g.total)}
                      {g.installments.length > 1 && ` · ${g.installments.length} installments`}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteGroup(g)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
                <ul className="mt-2 space-y-0.5 text-xs">
                  {g.installments.map((inst) => (
                    <li key={inst.id} className="flex justify-between">
                      <span className="text-muted-foreground">
                        {formatShortDay(inst.payday_date)}
                        {inst.installment_total && ` · ${inst.installment_number} of ${inst.installment_total}`}
                      </span>
                      <span className="font-medium">{formatMoney(inst.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="repair" className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label>Description *</Label>
              <Input value={repairLabel} onChange={(e) => setRepairLabel(e.target.value)} placeholder="Brake job" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Total amount *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                  <Input
                    type="number" step="0.01" min="0" inputMode="decimal"
                    value={repairTotal} onChange={(e) => setRepairTotal(e.target.value)}
                    placeholder="1000.00" className="pl-7"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label># of installments *</Label>
                <Input
                  type="number" min="1" max="12"
                  value={repairCount} onChange={(e) => setRepairCount(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Starting payday *</Label>
              <select
                value={repairFirstPayday}
                onChange={(e) => setRepairFirstPayday(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {upcoming.map((w) => (
                  <option key={w.payday} value={w.payday}>{formatShortDay(w.payday)}</option>
                ))}
              </select>
            </div>
            {repairTotal && repairCount && parseFloat(repairTotal) > 0 && parseInt(repairCount, 10) > 0 && (
              <div className="text-xs bg-muted/50 rounded p-2 space-y-0.5">
                <p className="font-medium text-foreground">Preview:</p>
                {splitInstallments(parseFloat(repairTotal), parseInt(repairCount, 10)).map((amt, i) => (
                  <p key={i} className="text-muted-foreground">
                    {formatShortDay(buildInstallmentPaydays(repairFirstPayday, parseInt(repairCount, 10))[i])} — {formatMoney(amt)}
                  </p>
                ))}
              </div>
            )}
            <Button onClick={saveRepair} className="w-full">Schedule Repair Payback</Button>
          </TabsContent>

          <TabsContent value="oneoff" className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label>Description *</Label>
              <Input
                value={oneoffLabel} onChange={(e) => setOneoffLabel(e.target.value)}
                placeholder="MO registration"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Amount *</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input
                  type="number" step="0.01" min="0" inputMode="decimal"
                  value={oneoffAmount} onChange={(e) => setOneoffAmount(e.target.value)}
                  placeholder="450.00" className="pl-7"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Payday *</Label>
              <select
                value={oneoffPayday}
                onChange={(e) => setOneoffPayday(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {upcoming.map((w) => (
                  <option key={w.payday} value={w.payday}>{formatShortDay(w.payday)}</option>
                ))}
              </select>
            </div>
            <Button onClick={saveOneoff} className="w-full">Add Deduction</Button>
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
