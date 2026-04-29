import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Calculator, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import {
  getUpcomingPaydays, getWorkWeekFor, PAY_PERCENTAGE_DEFAULT, toDateStr, WorkWeek,
} from '@/lib/settlementMath';
import SettlementCard, { LoadRow, ExpenseRow, DeductionRow } from './SettlementCard';
import AddLoadModal from './AddLoadModal';
import AddExpenseModal from './AddExpenseModal';
import DeductionsManager from './DeductionsManager';
import PastSettlements from './PastSettlements';

interface Props {
  operatorId: string;
  /** When true, hides all add/edit/delete affordances and modals. Used by Staff/Management views. */
  readOnly?: boolean;
  /** Fired exactly once after the first data fetch resolves. */
  onReady?: () => void;
}

export default function SettlementForecast({ operatorId, readOnly = false, onReady }: Props) {
  const [loading, setLoading] = useState(true);
  const readyFiredRef = useRef(false);
  const [payPercentage, setPayPercentage] = useState<number>(PAY_PERCENTAGE_DEFAULT);
  const [loads, setLoads] = useState<LoadRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [deductions, setDeductions] = useState<DeductionRow[]>([]);

  const [addLoadFor, setAddLoadFor] = useState<WorkWeek | null>(null);
  const [addFuelFor, setAddFuelFor] = useState<WorkWeek | null>(null);
  const [addAdvanceFor, setAddAdvanceFor] = useState<WorkWeek | null>(null);
  const [deductionsOpen, setDeductionsOpen] = useState(false);

  const upcoming = useMemo(() => getUpcomingPaydays(3), []);

  const fetchAll = useCallback(async () => {
    if (!operatorId) return;
    setLoading(true);

    // Range covering all 3 upcoming work weeks (use earliest weekStart and latest weekEnd)
    const earliestStart = upcoming[0].weekStart;
    const latestEnd = upcoming[upcoming.length - 1].weekEnd;
    const earliestPayday = upcoming[0].payday;
    const latestPayday = upcoming[upcoming.length - 1].payday;

    const [opRes, loadsRes, expRes, dedRes] = await Promise.all([
      supabase.from('operators').select('pay_percentage').eq('id', operatorId).maybeSingle(),
      supabase.from('forecast_loads')
        .select('id, delivery_date, delivery_city, delivery_state, load_rate')
        .eq('operator_id', operatorId)
        .gte('delivery_date', earliestStart)
        .lte('delivery_date', latestEnd)
        .order('delivery_date', { ascending: true }),
      supabase.from('forecast_expenses')
        .select('id, expense_date, expense_type, amount')
        .eq('operator_id', operatorId)
        .gte('expense_date', earliestStart)
        .lte('expense_date', latestEnd)
        .order('expense_date', { ascending: true }),
      supabase.from('forecast_deductions')
        .select('id, label, payday_date, amount, installment_number, installment_total')
        .eq('operator_id', operatorId)
        .gte('payday_date', earliestPayday)
        .lte('payday_date', latestPayday)
        .order('payday_date', { ascending: true }),
    ]);

    setLoading(false);

    if (opRes.error) {
      toast({ title: 'Could not load settings', description: opRes.error.message, variant: 'destructive' });
    } else if (opRes.data?.pay_percentage) {
      setPayPercentage(Number(opRes.data.pay_percentage));
    }

    if (loadsRes.error) {
      toast({ title: 'Could not load loads', description: loadsRes.error.message, variant: 'destructive' });
    } else {
      setLoads((loadsRes.data ?? []).map((l) => ({ ...l, load_rate: Number(l.load_rate) })));
    }

    if (expRes.error) {
      toast({ title: 'Could not load expenses', description: expRes.error.message, variant: 'destructive' });
    } else {
      setExpenses((expRes.data ?? []).map((e) => ({
        ...e,
        amount: Number(e.amount),
        expense_type: e.expense_type as 'fuel' | 'advance',
      })));
    }

    if (dedRes.error) {
      toast({ title: 'Could not load deductions', description: dedRes.error.message, variant: 'destructive' });
    } else {
      setDeductions((dedRes.data ?? []).map((d) => ({ ...d, amount: Number(d.amount) })));
    }
  }, [operatorId, upcoming]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const bucketFor = (week: WorkWeek) => ({
    loads: loads.filter((l) => {
      const w = getWorkWeekFor(l.delivery_date);
      return w.payday === week.payday;
    }),
    expenses: expenses.filter((e) => {
      const w = getWorkWeekFor(e.expense_date);
      return w.payday === week.payday;
    }),
    deductions: deductions.filter((d) => d.payday_date === week.payday),
  });

  return (
    <div className="space-y-4 animate-fade-in pb-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Calculator className="h-6 w-6 text-primary" />
          <div>
            <h2 className="text-lg font-bold text-foreground">Settlement Forecast</h2>
            <p className="text-sm text-muted-foreground">
              {readOnly ? 'Operator view · ' : 'Plan your next 3 paydays · '}
              {readOnly ? 'Pay rate: ' : 'Your pay rate: '}
              <strong>{payPercentage}%</strong>
            </p>
          </div>
        </div>
      </div>

      {/* Staff banner — only shown in read-only (staff/management) view */}
      {readOnly && (
        <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Viewing as operator — read-only. Operators self-manage these entries.
        </div>
      )}

      {/* Disclaimer */}
      <div className="flex gap-2 rounded-md border border-status-progress/30 bg-status-progress/10 p-3 text-xs">
        <AlertTriangle className="h-4 w-4 shrink-0 text-status-progress mt-0.5" />
        <div>
          <p className="font-semibold text-foreground">Forecast Only</p>
          <p className="text-muted-foreground mt-0.5">
            This tool estimates your settlement based on the loads, fuel, and deductions you enter. It does
            not include tolls, IFTA, registration renewals, or other fees that may apply. Actual settlement
            may differ.
          </p>
        </div>
      </div>

      {/* Work-week reminder */}
      <Card className="p-3 bg-muted/30 text-xs text-muted-foreground">
        <p>
          <strong className="text-foreground">Work week:</strong> Wednesday – Tuesday.
          Loads delivered and fuel purchased in a work week are paid out on the Tuesday <strong>two weeks later</strong>.
        </p>
      </Card>

      {/* Cards */}
      {loading ? (
        <div className="py-12 text-center text-muted-foreground text-sm">Loading your forecast…</div>
      ) : (
        upcoming.map((week) => {
          const b = bucketFor(week);
          return (
            <SettlementCard
              key={week.payday}
              week={week}
              loads={b.loads}
              expenses={b.expenses}
              deductions={b.deductions}
              payPercentage={payPercentage}
              readOnly={readOnly}
              onAddLoad={readOnly ? undefined : () => setAddLoadFor(week)}
              onAddFuel={readOnly ? undefined : () => setAddFuelFor(week)}
              onAddAdvance={readOnly ? undefined : () => setAddAdvanceFor(week)}
              onChanged={fetchAll}
            />
          );
        })
      )}

      {/* Manage deductions — hidden in read-only mode */}
      {!readOnly && (
        <Button variant="outline" className="w-full" onClick={() => setDeductionsOpen(true)}>
          <Settings2 className="h-4 w-4 mr-2" />
          Manage Repair Payback & Other Deductions
        </Button>
      )}

      {/* History */}
      <PastSettlements operatorId={operatorId} payPercentage={payPercentage} />

      {/* Modals — only mounted when editing is enabled */}
      {!readOnly && (
        <>
          <AddLoadModal
            open={!!addLoadFor}
            onOpenChange={(v) => !v && setAddLoadFor(null)}
            operatorId={operatorId}
            payPercentage={payPercentage}
            defaultDate={addLoadFor ? defaultDateForWeek(addLoadFor) : undefined}
            onSaved={fetchAll}
          />
          <AddExpenseModal
            open={!!addFuelFor}
            onOpenChange={(v) => !v && setAddFuelFor(null)}
            operatorId={operatorId}
            expenseType="fuel"
            defaultDate={addFuelFor ? defaultDateForWeek(addFuelFor) : undefined}
            onSaved={fetchAll}
          />
          <AddExpenseModal
            open={!!addAdvanceFor}
            onOpenChange={(v) => !v && setAddAdvanceFor(null)}
            operatorId={operatorId}
            expenseType="advance"
            defaultDate={addAdvanceFor ? defaultDateForWeek(addAdvanceFor) : undefined}
            onSaved={fetchAll}
          />
          <DeductionsManager
            open={deductionsOpen}
            onOpenChange={setDeductionsOpen}
            operatorId={operatorId}
            onSaved={fetchAll}
          />
        </>
      )}
    </div>
  );
}

/**
 * Default date for the modal: today if it falls in this work week, otherwise the
 * week's start (Wednesday).
 */
function defaultDateForWeek(week: WorkWeek): string {
  const today = toDateStr(new Date());
  if (today >= week.weekStart && today <= week.weekEnd) return today;
  return week.weekStart;
}
