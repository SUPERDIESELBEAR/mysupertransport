import { MapPin, Package, Clock, FileWarning, MessageSquare, Phone } from 'lucide-react';
import { formatCurrency, formatEnumLabel } from '@/lib/loadFormat';
import { formatCarrierWindow } from '@/lib/operatorHome';
import type { HomeLoad } from '@/hooks/useOperatorHome';
import type { DriverLoadPayEstimate } from '@/lib/driverLoadPay';

/**
 * Today's work, as the driver sees it.
 *
 * PRESENTATION ONLY — every value arrives as a prop. The money shown is the
 * driver's estimated share, never the gross line haul and never the split
 * percentage: see src/lib/driverLoadPay.ts for why.
 */

function StopLine({ label, city, state, facility, start, end }: {
  label: string;
  city: string | null;
  state: string | null;
  facility?: string | null;
  start?: string | null;
  end?: string | null;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold text-foreground leading-snug">
          {[city, state].filter(Boolean).join(', ') || 'Location to be confirmed'}
        </p>
        {facility && <p className="text-xs text-muted-foreground leading-snug">{facility}</p>}
        {(start || end) && (
          <p className="text-xs text-muted-foreground leading-snug mt-0.5">
            {formatCarrierWindow(start, end)}
          </p>
        )}
      </div>
    </div>
  );
}

export function OperatorTodayCard({
  load, pay, queuedCount, onOpenLoad, onMessageDispatcher, dispatcher,
}: {
  load: HomeLoad;
  pay: DriverLoadPayEstimate | null;
  queuedCount: number;
  onOpenLoad?: () => void;
  onMessageDispatcher?: () => void;
  dispatcher?: { name: string; phone: string | null } | null;
}) {
  const next = load.next;
  return (
    <section className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden animate-fade-in">
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border bg-muted/30">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Current load</p>
          <p className="text-base font-bold text-foreground truncate">{load.load_number}</p>
        </div>
        <span className="shrink-0 rounded-full bg-primary/10 text-primary text-[11px] font-bold px-2.5 py-1">
          {formatEnumLabel(String(load.status))}
        </span>
      </div>

      <div className="px-5 py-4 space-y-4">
        {next && (
          <StopLine
            label={next.stop_type === 'delivery' ? 'Next — deliver' : 'Next — pick up'}
            city={next.city}
            state={next.state}
            facility={next.facility_name}
            start={next.appointment_start}
            end={next.appointment_end}
          />
        )}

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Package className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            {[load.originCity, load.originState].filter(Boolean).join(', ') || '—'}
            {' → '}
            {[load.destinationCity, load.destinationState].filter(Boolean).join(', ') || '—'}
            {load.brokerName ? ` · ${load.brokerName}` : ''}
          </span>
        </div>

        {/* ABSENCE IS INFORMATION. A missing or incomplete estimate must never
            render as a dollar figure — $0.00 reads as "this load pays nothing".
            Same rule as "Not stated" on detention terms. */}
        {pay && (
          <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Estimated for you on this load
            </p>
            {pay.amount === null || pay.incomplete ? (
              <>
                <p className="text-sm font-semibold text-muted-foreground leading-tight">Not yet calculated</p>
                <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                  Charges for this load are still being entered. Your dispatcher can tell you more.
                </p>
              </>
            ) : (
              <>
                <p className="text-xl font-bold text-foreground leading-tight">{formatCurrency(pay.amount)}</p>
                <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                  Estimate. Final amount is set on your settlement.
                </p>
              </>
            )}
          </div>
        )}


        {load.outstandingPaperwork.length > 0 && (
          <div className="flex items-start gap-2.5 rounded-xl border border-info/40 bg-info/8 px-4 py-3">
            <FileWarning className="h-4 w-4 text-info mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-info">Paperwork still needed</p>
              <p className="text-xs text-info/80 leading-snug">{load.outstandingPaperwork.join(' · ')}</p>
            </div>
          </div>
        )}

        {queuedCount > 0 && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            {queuedCount === 1 ? '1 more load' : `${queuedCount} more loads`} lined up after this one
          </p>
        )}

        {(onMessageDispatcher || dispatcher) && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {onMessageDispatcher && (
              <button
                type="button"
                onClick={onMessageDispatcher}
                className="flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold px-3 py-2 hover:bg-primary/90 transition-colors"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Message {dispatcher?.name?.split(' ')[0] ?? 'dispatcher'}
              </button>
            )}
            {dispatcher?.phone && (
              <a
                href={`tel:${dispatcher.phone}`}
                className="flex items-center gap-1.5 rounded-lg border border-border text-xs font-semibold px-3 py-2 text-foreground hover:bg-muted transition-colors"
              >
                <Phone className="h-3.5 w-3.5" />
                {dispatcher.phone}
              </a>
            )}
            {onOpenLoad && (
              <button
                type="button"
                onClick={onOpenLoad}
                className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
              >
                Dispatch details
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

/** Delivered loads that still owe paperwork. Office work, kept off the load card. */
export function OperatorPaperworkTail({ loads }: { loads: HomeLoad[] }) {
  if (loads.length === 0) return null;
  return (
    <section className="rounded-2xl border border-border bg-card px-5 py-4 space-y-2.5">
      <p className="text-sm font-semibold text-foreground">Paperwork to finish</p>
      {loads.map(l => (
        <div key={l.id} className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{l.load_number}</p>
            <p className="text-xs text-muted-foreground leading-snug">
              {l.outstandingPaperwork.length > 0 ? l.outstandingPaperwork.join(' · ') : 'Awaiting review'}
            </p>
          </div>
          <span className="text-[11px] text-muted-foreground shrink-0">
            {[l.destinationCity, l.destinationState].filter(Boolean).join(', ')}
          </span>
        </div>
      ))}
    </section>
  );
}

/** Shown only when the driver has no driving work at all. */
export function OperatorNoLoadCard({ dispatchStatus, onMessageDispatcher }: {
  dispatchStatus: string | null;
  onMessageDispatcher?: () => void;
}) {
  const down = dispatchStatus === 'truck_down';
  return (
    <section className="rounded-2xl border border-border bg-card px-5 py-6 text-center space-y-2">
      <p className="text-sm font-semibold text-foreground">
        {down ? 'Your truck is marked down' : 'No load assigned right now'}
      </p>
      <p className="text-xs text-muted-foreground leading-snug">
        {down
          ? 'Dispatch has you out of service. Message your dispatcher when the truck is ready.'
          : 'Your dispatcher will assign your next load. It will show up here.'}
      </p>
      {onMessageDispatcher && (
        <button
          type="button"
          onClick={onMessageDispatcher}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold px-3 py-2 hover:bg-primary/90 transition-colors"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Message dispatcher
        </button>
      )}
    </section>
  );
}
