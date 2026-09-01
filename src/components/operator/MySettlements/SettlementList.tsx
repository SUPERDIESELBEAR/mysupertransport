/**
 * The rendered settlement, phone-first. Read-only: the driver looks, he does
 * not act. Every string that explains WHY money did not move comes from the
 * engine or from settlementConfig — there is no second copy here.
 */
import { useState } from 'react';
import { ChevronDown, ChevronUp, AlertTriangle, Wallet, ShieldCheck } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatMoney, formatMonthDay, formatLongDay } from '@/lib/settlementMath';
import {
  SETTLEMENT_STATUS_LABELS,
  SETTLEMENT_STATUS_DRIVER_EXPLANATIONS,
  belowThresholdDriverLine,
} from '@/lib/settlementConfig';
import {
  deductionLines, earningLines, sumLines,
  type DriverRmDeposit, type DriverSettlement,
} from './settlementView';

function StatusBadge({ status }: { status: DriverSettlement['status'] }) {
  const tone =
    status === 'paid' ? 'bg-status-complete/15 text-status-complete'
      : status === 'held' ? 'bg-destructive/10 text-destructive'
        : 'bg-muted text-muted-foreground';
  return (
    <Badge variant="outline" className={`text-[11px] font-semibold tracking-wide ${tone}`}>
      {SETTLEMENT_STATUS_LABELS[status]}
    </Badge>
  );
}

function SettlementBlock({ settlement, defaultOpen }: { settlement: DriverSettlement; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const earnings = earningLines(settlement);
  const deductions = deductionLines(settlement);

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full px-4 py-4 text-left flex items-start justify-between gap-3"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">
            {formatMonthDay(settlement.periodStart)} – {formatMonthDay(settlement.periodEnd)}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {settlement.payday ? `Payday ${formatLongDay(settlement.payday)}` : 'Payday to be set'}
          </p>
          <div className="mt-2"><StatusBadge status={settlement.status} /></div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Net</p>
          <p className="text-2xl font-bold leading-tight">{formatMoney(settlement.netAmount)}</p>
          <span className="inline-flex items-center text-muted-foreground mt-1">
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
        </div>
      </button>

      <div className="px-4 pb-3 -mt-1">
        <p className="text-xs text-muted-foreground">
          {SETTLEMENT_STATUS_DRIVER_EXPLANATIONS[settlement.status]}
        </p>
        {settlement.status === 'below_threshold' && (
          <p className="text-xs text-muted-foreground mt-1">
            {belowThresholdDriverLine(settlement.netAmount)}
          </p>
        )}
        {settlement.status === 'held' && settlement.holdReason && (
          <p className="text-xs text-destructive mt-1">{settlement.holdReason}</p>
        )}
      </div>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t pt-4">
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Pay lines
            </h3>
            {earnings.length === 0 && (
              <p className="text-sm text-muted-foreground">Nothing paid on this settlement.</p>
            )}
            <ul className="space-y-1.5">
              {earnings.map(line => (
                <li key={line.id} className="flex items-start justify-between gap-3 text-sm">
                  <span className="text-foreground/90 break-words">{line.description}</span>
                  <span className="font-medium tabular-nums shrink-0">{formatMoney(line.amount)}</span>
                </li>
              ))}
            </ul>
            {earnings.length > 0 && (
              <div className="flex justify-between text-sm font-semibold mt-2 pt-2 border-t">
                <span>Total pay</span>
                <span className="tabular-nums">{formatMoney(sumLines(earnings))}</span>
              </div>
            )}
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Deductions
            </h3>
            {deductions.length === 0 && (
              <p className="text-sm text-muted-foreground">No deductions this settlement.</p>
            )}
            <ul className="space-y-1.5">
              {deductions.map(line => (
                <li key={line.id} className="flex items-start justify-between gap-3 text-sm">
                  <span className="text-foreground/90 break-words">{line.description}</span>
                  <span className="font-medium tabular-nums shrink-0">−{formatMoney(Math.abs(line.amount))}</span>
                </li>
              ))}
            </ul>
            {deductions.length > 0 && (
              <div className="flex justify-between text-sm font-semibold mt-2 pt-2 border-t">
                <span>Total deductions</span>
                <span className="tabular-nums">−{formatMoney(sumLines(deductions))}</span>
              </div>
            )}
          </section>

          {settlement.withheld.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" /> Loads not paid on this settlement
              </h3>
              <ul className="space-y-2">
                {settlement.withheld.map(w => (
                  <li key={w.id} className="rounded-md border bg-muted/30 p-3">
                    <p className="text-sm font-medium">Load {w.loadNumber}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">{w.message}</p>
                    {w.outstanding.length > 0 && (
                      <ul className="mt-1.5 flex flex-wrap gap-1.5">
                        {w.outstanding.map(item => (
                          <li key={item} className="text-[11px] rounded-full bg-background border px-2 py-0.5">
                            {item}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </Card>
  );
}

export interface SettlementListProps {
  settlements: DriverSettlement[];
  rmDeposit: DriverRmDeposit | null;
  loading?: boolean;
}

export default function SettlementList({ settlements, rmDeposit, loading }: SettlementListProps) {
  return (
    <div className="space-y-4 animate-fade-in">
      <div className="space-y-1">
        <h1 className="text-xl font-bold text-foreground">My Settlements</h1>
        <p className="text-sm text-muted-foreground">Your settled pay, most recent first.</p>
      </div>

      {rmDeposit && (
        <Card className="p-4 flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">Repair &amp; Maintenance Deposit</p>
            <p className="text-sm text-muted-foreground">
              Balance {formatMoney(rmDeposit.currentBalance)}
              {rmDeposit.targetAmount != null && ` of ${formatMoney(rmDeposit.targetAmount)} target`}
            </p>
          </div>
        </Card>
      )}

      {loading && <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>}

      {!loading && settlements.length === 0 && (
        <Card className="p-6 text-center">
          <Wallet className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            No settlements yet. They appear here once your work week is closed.
          </p>
        </Card>
      )}

      {settlements.map((s, i) => (
        <SettlementBlock key={s.id} settlement={s} defaultOpen={i === 0} />
      ))}
    </div>
  );
}
