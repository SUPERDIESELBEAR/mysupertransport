import { DetailSection, Field, FieldGrid } from './DetailPrimitives';
import { formatCurrency } from '@/lib/loadFormat';
import {
  DERIVED_USE_WINDOW_NOTE, describeDayCount, formatUseWindow,
} from '@/lib/loadoutUseWindow';

import { formatNumber, type LoadDetail } from '@/lib/loadDetail';
import { RATE_TYPE_LABELS, type RateType } from '@/lib/loadRateMath';
import {
  AWAITING_SCALE_TICKET_EXPLANATION, AWAITING_SCALE_TICKET_LABEL, isAwaitingScaleTicket,
} from '@/lib/perTonScale';
import { AlertTriangle } from 'lucide-react';

const n = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

export default function RateDetailsCard({ load }: { load: LoadDetail }) {
  const isLoadout = load.load_type === 'loadout';
  const rateType = load.rate_type as RateType;

  const loaded = n(load.loaded_miles);
  const deadhead = n(load.deadhead_miles);
  const totalMiles = loaded !== null || deadhead !== null ? (loaded ?? 0) + (deadhead ?? 0) : null;
  const totalValue = n(load.total_load_value);
  const rpm = totalValue !== null && loaded ? totalValue / loaded : null;

  const perMileTotal = n(load.rate_per_mile) !== null && loaded !== null
    ? (n(load.rate_per_mile) as number) * loaded : null;
  const tons = n(load.confirmed_tons) ?? n(load.estimated_tons);
  // Delivered per-ton with no ticket: the total shown is an estimate and the
  // driver cannot be paid for the load until the tons are recorded.
  const awaitingScale = isAwaitingScaleTicket(load);
  const perTonTotal = n(load.rate_per_ton) !== null && tons !== null
    ? (n(load.rate_per_ton) as number) * tons : null;

  return (
    <DetailSection title="Rate Details">
      <FieldGrid>
        {isLoadout ? (
          <>
            <Field label="Relocation Pay" value={formatCurrency(n(load.loadout_relocation_fee))} />
            <Field
              label="Trailer Use Window"
              value={formatUseWindow(load.loadout_use_start, load.loadout_use_end) || '—'}
              hint={describeDayCount({
                statedDays: load.loadout_use_period_days,
                start: load.loadout_use_start,
                end: load.loadout_use_end,
              }).text || undefined}
            />
            {load.loadout_use_window_source === 'derived' && (
              <Field label="Window Source" value={DERIVED_USE_WINDOW_NOTE} className="sm:col-span-2" />
            )}
          </>
        ) : (

          <>
            <Field label="Rate Type" value={RATE_TYPE_LABELS[rateType] ?? '—'} />
            {rateType === 'flat' && (
              <Field label="Linehaul Rate" value={formatCurrency(n(load.linehaul_rate))} />
            )}
            {rateType === 'per_mile' && (
              <>
                <Field label="Rate Per Mile" value={formatCurrency(n(load.rate_per_mile))} />
                <Field label="Calculated Linehaul" value={formatCurrency(perMileTotal)} />
              </>
            )}
            {rateType === 'per_ton' && (
              <>
                <Field label="Rate Per Ton" value={formatCurrency(n(load.rate_per_ton))} />
                <Field label="Estimated Tons" value={formatNumber(n(load.estimated_tons))} />
                <Field
                  label="Confirmed Tons"
                  value={
                    n(load.confirmed_tons) === null
                      ? <span className="text-muted-foreground">Awaiting scale ticket</span>
                      : formatNumber(n(load.confirmed_tons))
                  }
                />
                <Field
                  label="Calculated Linehaul"
                  value={formatCurrency(perTonTotal)}
                  hint={n(load.confirmed_tons) === null
                    ? 'Based on estimated tons — not a payable figure'
                    : 'From the scale ticket'}
                />
              </>
            )}
            {rateType === 'percentage_of_load' && (
              <Field
                label="Linehaul Rate"
                value={formatCurrency(n(load.linehaul_rate))}
                hint="Driver pay is a percentage of this load value"
              />
            )}
          </>
        )}

        <Field
          label="Fuel Surcharge"
          value={load.fsc_bundled_into_linehaul ? 'Bundled into linehaul' : formatCurrency(n(load.fsc_amount))}
        />
        <Field label="Loaded Miles" value={formatNumber(loaded)} />
        <Field label="Deadhead Miles" value={formatNumber(deadhead)} />
        <Field label="Total Miles" value={formatNumber(totalMiles)} />
        <Field label="Total Load Value" value={formatCurrency(totalValue)} />
        {rpm !== null ? (
          <Field label="Revenue Per Mile" value={`${formatCurrency(rpm)} / mi`} />
        ) : null}
      </FieldGrid>

      {awaitingScale && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div>
            <div className="font-medium">{AWAITING_SCALE_TICKET_LABEL}</div>
            <p className="text-muted-foreground">{AWAITING_SCALE_TICKET_EXPLANATION}</p>
          </div>
        </div>
      )}
    </DetailSection>
  );
}
