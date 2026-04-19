import { ChevronDown, ChevronUp, Plus, Trash2, Truck, Fuel, Wallet, Wrench, Receipt } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import {
  formatLongDay,
  formatMonthDay,
  formatMoney,
  formatShortDay,
  WorkWeek,
} from '@/lib/settlementMath';

export type LoadRow = {
  id: string;
  delivery_date: string;
  delivery_city: string | null;
  delivery_state: string | null;
  load_rate: number;
};

export type ExpenseRow = {
  id: string;
  expense_date: string;
  expense_type: 'fuel' | 'advance';
  amount: number;
};

export type DeductionRow = {
  id: string;
  label: string;
  payday_date: string;
  amount: number;
  installment_number: number | null;
  installment_total: number | null;
};

interface Props {
  week: WorkWeek;
  loads: LoadRow[];
  expenses: ExpenseRow[];
  deductions: DeductionRow[];
  payPercentage: number;
  readOnly?: boolean;
  onAddLoad?: () => void;
  onAddFuel?: () => void;
  onAddAdvance?: () => void;
  onChanged: () => void;
}

export default function SettlementCard({
  week, loads, expenses, deductions, payPercentage, readOnly,
  onAddLoad, onAddFuel, onAddAdvance, onChanged,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);

  const fuel = expenses.filter((e) => e.expense_type === 'fuel');
  const advances = expenses.filter((e) => e.expense_type === 'advance');
  const repairItems = deductions.filter((d) => d.installment_total && d.installment_total > 1);
  const otherItems = deductions.filter((d) => !d.installment_total || d.installment_total === 1);

  const grossTotal = loads.reduce((s, l) => s + Number(l.load_rate), 0);
  const grossNet = grossTotal * (payPercentage / 100);
  const fuelTotal = fuel.reduce((s, e) => s + Number(e.amount), 0);
  const advTotal = advances.reduce((s, e) => s + Number(e.amount), 0);
  const repairTotal = repairItems.reduce((s, d) => s + Number(d.amount), 0);
  const otherTotal = otherItems.reduce((s, d) => s + Number(d.amount), 0);
  const net = grossNet - fuelTotal - advTotal - repairTotal - otherTotal;

  const deleteLoad = async (id: string) => {
    const { error } = await supabase.from('forecast_loads').delete().eq('id', id);
    if (error) { toast({ title: 'Could not delete', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Load removed' });
    onChanged();
  };
  const deleteExpense = async (id: string) => {
    const { error } = await supabase.from('forecast_expenses').delete().eq('id', id);
    if (error) { toast({ title: 'Could not delete', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Removed' });
    onChanged();
  };

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <div className="bg-primary/5 border-b px-4 py-3 flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="flex-1 text-left flex items-center gap-2 min-w-0"
          aria-label={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronUp className="h-4 w-4 shrink-0" />}
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Payday</p>
            <p className="font-bold text-foreground">{formatLongDay(week.payday)}</p>
            <p className="text-xs text-muted-foreground">
              Work week {formatMonthDay(week.weekStart)} – {formatMonthDay(week.weekEnd)}
            </p>
          </div>
        </button>
        <div className="text-right shrink-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Net Forecast</p>
          <p className={`text-lg font-bold ${net >= 0 ? 'text-status-complete' : 'text-destructive'}`}>
            {formatMoney(net)}
          </p>
        </div>
      </div>

      {!collapsed && (
        <div className="p-4 space-y-4 text-sm">
          {/* Loads */}
          <Section
            icon={<Truck className="h-4 w-4 text-primary" />}
            title={`Loads (${loads.length})`}
            total={`+${formatMoney(grossNet)}`}
            totalTone="positive"
            actionLabel="Add load"
            onAction={readOnly ? undefined : onAddLoad}
          >
            {loads.length === 0 && <p className="text-xs text-muted-foreground italic py-1">No loads yet</p>}
            {loads.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-2 py-1">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">{formatShortDay(l.delivery_date)}</p>
                  <p className="truncate">
                    {[l.delivery_city, l.delivery_state].filter(Boolean).join(', ') || '—'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">{formatMoney(Number(l.load_rate))}</p>
                  <p className="font-medium">{formatMoney(Number(l.load_rate) * (payPercentage / 100))}</p>
                </div>
                {!readOnly && (
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteLoad(l.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
          </Section>

          {/* Fuel */}
          <Section
            icon={<Fuel className="h-4 w-4 text-primary" />}
            title={`Fuel (${fuel.length})`}
            total={fuelTotal > 0 ? `−${formatMoney(fuelTotal)}` : formatMoney(0)}
            totalTone={fuelTotal > 0 ? 'negative' : 'neutral'}
            actionLabel="Add fuel"
            onAction={readOnly ? undefined : onAddFuel}
          >
            {fuel.length === 0 && <p className="text-xs text-muted-foreground italic py-1">No fuel logged</p>}
            {fuel.map((e) => (
              <div key={e.id} className="flex items-center justify-between py-1">
                <p className="text-xs text-muted-foreground">{formatShortDay(e.expense_date)}</p>
                <p className="font-medium">{formatMoney(Number(e.amount))}</p>
                {!readOnly && (
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteExpense(e.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
          </Section>

          {/* Cash advance */}
          <Section
            icon={<Wallet className="h-4 w-4 text-primary" />}
            title={`Cash Advance (${advances.length})`}
            total={advTotal > 0 ? `−${formatMoney(advTotal)}` : formatMoney(0)}
            totalTone={advTotal > 0 ? 'negative' : 'neutral'}
            actionLabel="Add advance"
            onAction={readOnly ? undefined : onAddAdvance}
          >
            {advances.length === 0 && <p className="text-xs text-muted-foreground italic py-1">None</p>}
            {advances.map((e) => (
              <div key={e.id} className="flex items-center justify-between py-1">
                <p className="text-xs text-muted-foreground">{formatShortDay(e.expense_date)}</p>
                <p className="font-medium">{formatMoney(Number(e.amount))}</p>
                {!readOnly && (
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteExpense(e.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
          </Section>

          {/* Repair payback */}
          {repairItems.length > 0 && (
            <Section
              icon={<Wrench className="h-4 w-4 text-muted-foreground" />}
              title="Repair Payback"
              total={`−${formatMoney(repairTotal)}`}
              totalTone="negative"
            >
              {repairItems.map((d) => (
                <div key={d.id} className="flex items-center justify-between py-1">
                  <div className="min-w-0">
                    <p className="truncate">{d.label}</p>
                    <p className="text-xs text-muted-foreground">
                      Installment {d.installment_number} of {d.installment_total}
                    </p>
                  </div>
                  <p className="font-medium">{formatMoney(Number(d.amount))}</p>
                </div>
              ))}
            </Section>
          )}

          {/* Other one-off deductions */}
          {otherItems.length > 0 && (
            <Section
              icon={<Receipt className="h-4 w-4 text-muted-foreground" />}
              title="Other Deductions"
              total={`−${formatMoney(otherTotal)}`}
              totalTone="negative"
            >
              {otherItems.map((d) => (
                <div key={d.id} className="flex items-center justify-between py-1">
                  <p className="truncate">{d.label}</p>
                  <p className="font-medium">{formatMoney(Number(d.amount))}</p>
                </div>
              ))}
            </Section>
          )}
        </div>
      )}
    </Card>
  );
}

function Section({
  icon, title, total, totalTone, actionLabel, onAction, children,
}: {
  icon: React.ReactNode;
  title: string;
  total: string;
  totalTone: 'positive' | 'negative' | 'neutral';
  actionLabel?: string;
  onAction?: () => void;
  children: React.ReactNode;
}) {
  const toneClass =
    totalTone === 'positive' ? 'text-status-complete' :
    totalTone === 'negative' ? 'text-destructive' :
    'text-muted-foreground';
  return (
    <div className="border-t pt-3 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-medium text-sm">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold ${toneClass}`}>{total}</span>
          {onAction && (
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={onAction}>
              <Plus className="h-3 w-3 mr-1" />{actionLabel}
            </Button>
          )}
        </div>
      </div>
      <div className="pl-6">{children}</div>
    </div>
  );
}
