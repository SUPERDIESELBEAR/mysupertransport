import { Bookmark, CheckCircle2, Circle, DollarSign, Hash } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { DetailSection } from './DetailPrimitives';
import { formatCurrency } from '@/lib/loadFormat';
import { formatPhone } from '@/lib/textNormalize';
import { formatDateTime, formatDuration, formatWindow, type LoadDetail } from '@/lib/loadDetail';
import { STOP_TYPE_LABELS, type StopType } from '@/lib/loadRateMath';

type Stop = LoadDetail['stops'][number];

const STOP_TYPE_CLASSES: Record<StopType, string> = {
  pickup: 'bg-info/12 text-info border-info/30',
  delivery: 'bg-status-complete/12 text-status-complete border-status-complete/30',
  drop_and_hook: 'bg-warning/15 text-warning border-warning/35',
};

function addressLines(stop: Stop): string[] {
  const cityLine = [stop.city, stop.state].filter(Boolean).join(', ');
  return [
    stop.address_line1,
    stop.address_line2,
    [cityLine, stop.zip].filter(Boolean).join(' '),
  ].filter((l): l is string => !!l && l.trim().length > 0);
}

function StopCard({ stop }: { stop: Stop }) {
  const completed = !!stop.actual_arrival_at && !!stop.actual_departure_at;
  const dwell = completed
    ? formatDuration(stop.actual_arrival_at as string, stop.actual_departure_at as string)
    : null;
  const lines = addressLines(stop);

  return (
    <li className="relative pl-10">
      <span
        className={cn(
          'absolute left-0 top-1 flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold',
          completed
            ? 'border-status-complete/40 bg-status-complete/12 text-status-complete'
            : 'border-border bg-muted text-muted-foreground',
        )}
      >
        {stop.stop_sequence ?? '?'}
      </span>

      <div
        className={cn(
          'rounded-lg border p-3 sm:p-4',
          completed ? 'border-status-complete/30 bg-status-complete/5' : 'border-border bg-background',
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className={cn('text-[11px] font-medium', STOP_TYPE_CLASSES[stop.stop_type as StopType])}
          >
            {STOP_TYPE_LABELS[stop.stop_type as StopType]}
          </Badge>
          <span className="text-sm font-semibold text-foreground">{stop.facility_name || 'Facility TBD'}</span>
          {stop.reference_number ? (
            <span className="inline-flex items-center gap-1 rounded-md border border-gold/40 bg-gold/10 px-2 py-0.5 text-[11px] font-semibold text-foreground">
              <Hash className="h-3 w-3 text-gold" />
              {stop.reference_label ? `${stop.reference_label} ` : ''}
              <span className="font-mono">{stop.reference_number}</span>
            </span>
          ) : null}
          {stop.facility_id ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Bookmark className="h-3 w-3" /> Saved facility
            </span>
          ) : null}
          {stop.stopoff_charge_eligible ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-warning">
              <DollarSign className="h-3 w-3" />
              Stop-off charge
              {stop.stopoff_charge_amount ? ` ${formatCurrency(stop.stopoff_charge_amount)}` : ''}
            </span>
          ) : null}
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            {completed ? <CheckCircle2 className="h-3.5 w-3.5 text-status-complete" /> : <Circle className="h-3.5 w-3.5" />}
            {completed ? 'Completed' : 'Upcoming'}
          </span>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="text-sm text-muted-foreground">
            {lines.length > 0
              ? lines.map(line => <div key={line}>{line}</div>)
              : <div>No address on file</div>}
            {stop.contact_name || stop.contact_phone ? (
              <div className="mt-2 text-foreground">
                {stop.contact_name}
                {stop.contact_phone ? (
                  <span className="text-muted-foreground">
                    {stop.contact_name ? ' · ' : ''}{formatPhone(stop.contact_phone)}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="space-y-1 text-sm">
            <div>
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Appointment</span>
              <div className="text-foreground">{formatWindow(stop.appointment_start, stop.appointment_end)}</div>
            </div>
            <div className="text-muted-foreground">
              Arrived: <span className="text-foreground">
                {stop.actual_arrival_at ? formatDateTime(stop.actual_arrival_at) : 'Not yet arrived'}
              </span>
            </div>
            <div className="text-muted-foreground">
              Departed: <span className="text-foreground">
                {stop.actual_departure_at ? formatDateTime(stop.actual_departure_at) : 'Not yet departed'}
              </span>
            </div>
            {dwell ? <div className="text-muted-foreground">Time at facility: <span className="text-foreground">{dwell}</span></div> : null}
          </div>
        </div>

        {stop.stop_notes ? (
          <p className="mt-3 whitespace-pre-wrap rounded-md bg-muted/60 p-2 text-sm text-muted-foreground">
            {stop.stop_notes}
          </p>
        ) : null}
      </div>
    </li>
  );
}

export default function StopsTimeline({ stops }: { stops: LoadDetail['stops'] }) {
  return (
    <DetailSection title={`Stops (${stops.length})`}>
      {stops.length === 0 ? (
        <p className="text-sm text-muted-foreground">No stops recorded for this load.</p>
      ) : (
        <ol className="relative space-y-4">
          <span className="absolute left-[13px] top-3 bottom-3 w-px bg-border" aria-hidden />
          {stops.map(stop => <StopCard key={stop.id} stop={stop} />)}
        </ol>
      )}
    </DetailSection>
  );
}
