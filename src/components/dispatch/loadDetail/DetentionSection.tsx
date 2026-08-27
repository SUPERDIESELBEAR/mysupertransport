import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { carrierZoneAbbrev, isoToNaive } from '@/lib/carrierTimezone';
import { formatDateTime, formatWindow, type LoadDetail } from '@/lib/loadDetail';
import { STOP_TYPE_LABELS, type StopType } from '@/lib/loadRateMath';
import { formatCurrency } from '@/lib/loadFormat';
import { fetchLoadCharges, type LoadChargeRecord } from '@/lib/loadCharges';
import type { StopTimeProvenance, StopTimeSource } from '@/lib/stopTimes';
import {
  advanceDetentionClaimStatus,
  detentionClaimAgeDays,
  detentionToInputValue,
  DETENTION_METHODS,
  DETENTION_METHOD_LABELS,
  DETENTION_STATUS_LABELS,
  fetchDetentionClaims,
  isTerminalDetentionStatus,
  nextDetentionStatuses,
  raiseDetentionClaim,
  recordDetentionNotification,
  type DetentionClaim,
  type DetentionClaimStatus,
  type DetentionNotificationMethod,
} from '@/lib/detentionClaims';
import {
  DETENTION_CLOCK_START_LABELS,
  EMPTY_DETENTION_TERMS,
  freeTimeLabel,
  hasAnyDetentionTerms,
  needsNotificationPrompt,
  notificationLabel,
  type DetentionTerms,
} from '@/lib/detentionTerms';
import { DetailSection } from './DetailPrimitives';
import StopTimePicker from './StopTimePicker';

/**
 * Detention on Load Detail.
 *
 * This section records the CONVERSATION with the broker. It shows the stop's
 * appointment window and its recorded arrival and departure as EVIDENCE — the
 * lines a dispatcher pastes into the broker email — and deliberately shows no
 * detention duration, no eligible hours and no dollar figure. Detention is
 * negotiated, and the revised rate confirmation is the authority; the money
 * arrives through the existing parse path, not from here.
 */

type Stop = LoadDetail['stops'][number] & StopTimeProvenance;

const STATUS_TONE: Record<DetentionClaimStatus, string> = {
  open: 'border-warning/40 bg-warning/10 text-warning',
  notified: 'border-info/40 bg-info/10 text-info',
  in_discussion: 'border-info/40 bg-info/10 text-info',
  resolved_revision: 'border-status-complete/40 bg-status-complete/10 text-status-complete',
  denied: 'border-destructive/40 bg-destructive/10 text-destructive',
  abandoned: 'border-border bg-muted text-muted-foreground',
};

function Zone({ at }: { at: string | null | undefined }) {
  const abbrev = carrierZoneAbbrev(at);
  if (!abbrev) return null;
  return <span className="ml-1 text-[11px] text-muted-foreground">{abbrev}</span>;
}

function provenanceText(
  source: StopTimeSource | null | undefined,
  recordedBy: string | null | undefined,
  names: Map<string, string>,
): string | null {
  if (!source) return null;
  return source === 'driver_app'
    ? 'Driver check-in'
    : `Entered by ${(recordedBy && names.get(recordedBy)) || 'dispatch'}`;
}

const nowNaive = () => isoToNaive(new Date().toISOString());

/** The stop's times, exactly as recorded — missing ones said plainly. */
function Evidence({ stop, names }: { stop: Stop | undefined; names: Map<string, string> }) {
  if (!stop) {
    return (
      <p className="text-sm text-muted-foreground">
        No stop was recorded on this claim, so there are no times to send the broker.
      </p>
    );
  }
  const arrivalNote = provenanceText(stop.arrival_source, stop.arrival_recorded_by, names);
  const departureNote = provenanceText(stop.departure_source, stop.departure_recorded_by, names);
  const missing = !stop.actual_arrival_at || !stop.actual_departure_at;

  return (
    <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Evidence for the broker
      </p>
      <div className="mt-1 text-foreground">
        Stop {stop.stop_sequence ?? '?'} · {STOP_TYPE_LABELS[stop.stop_type as StopType]}
        {stop.facility_name ? ` · ${stop.facility_name}` : ''}
      </div>
      <div className="mt-1 text-muted-foreground">
        Appointment:{' '}
        <span className="text-foreground">
          {formatWindow(stop.appointment_start, stop.appointment_end)}
        </span>
        <Zone at={stop.appointment_start ?? stop.appointment_end} />
      </div>
      <div className="mt-1 text-muted-foreground">
        Arrived:{' '}
        {stop.actual_arrival_at ? (
          <>
            <span className="text-foreground">{formatDateTime(stop.actual_arrival_at)}</span>
            <Zone at={stop.actual_arrival_at} />
            {arrivalNote ? <div className="text-[11px]">{arrivalNote}</div> : null}
          </>
        ) : (
          <span className="font-medium text-warning">No arrival recorded</span>
        )}
      </div>
      <div className="mt-1 text-muted-foreground">
        Departed:{' '}
        {stop.actual_departure_at ? (
          <>
            <span className="text-foreground">{formatDateTime(stop.actual_departure_at)}</span>
            <Zone at={stop.actual_departure_at} />
            {departureNote ? <div className="text-[11px]">{departureNote}</div> : null}
          </>
        ) : (
          <span className="font-medium text-warning">No departure recorded</span>
        )}
      </div>
      {missing ? (
        <p className="mt-2 flex items-start gap-1.5 text-[12px] text-warning">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          This claim has no complete on-site record. Brokers routinely refuse detention
          without one — get the times from the driver before sending.
        </p>
      ) : null}
    </div>
  );
}

/**
 * The terms block a dispatcher reads while the driver is on the phone.
 *
 * Scannable, not a form — terms are edited through Edit Load with the rest of
 * the load's contract data. Nothing here is computed: no eligible hours, no
 * dollar estimate, no comparison against a recorded arrival.
 */
function TermsBlock({ terms }: { terms: DetentionTerms }) {
  if (!hasAnyDetentionTerms(terms)) {
    return (
      <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
        This rate confirmation states no detention terms.
      </div>
    );
  }

  const notStated = <span className="text-muted-foreground">Not stated</span>;
  const row = (label: string, value: ReactNode) => (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">{value}</dd>
    </div>
  );

  return (
    <div className="rounded-md border border-border bg-muted/40 p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Terms stated on the rate confirmation
      </p>
      <dl className="mt-2 grid gap-3 sm:grid-cols-3">
        {row('Free time', freeTimeLabel(terms.freeTimeMinutes) ?? notStated)}
        {row('Rate per hour', terms.ratePerHour === null
          ? notStated
          : formatCurrency(terms.ratePerHour))}
        {row('Daily cap', terms.dailyCap === null ? notStated : formatCurrency(terms.dailyCap))}
        {row('Clock start', terms.clockStart === null
          ? notStated
          : DETENTION_CLOCK_START_LABELS[terms.clockStart])}
        {row('Notification', notificationLabel(terms.notificationRequired) ?? notStated)}
      </dl>
      {terms.note ? (
        <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{terms.note}</p>
      ) : null}
    </div>
  );
}

function chargeLabel(charge: LoadChargeRecord): string {
  const amount = charge.amount === null || charge.amount === undefined
    ? ''
    : ` · ${formatCurrency(Number(charge.amount))}`;
  return `${charge.charge_type}${charge.description ? ` — ${charge.description}` : ''}${amount}`;
}

export default function DetentionSection({
  loadId, stops, canManage, terms = EMPTY_DETENTION_TERMS,
}: {
  loadId: string;
  stops: LoadDetail['stops'];
  canManage: boolean;
  /** Terms as the rate confirmation stated them. Absent reads as not stated. */
  terms?: DetentionTerms;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const rows = stops as Stop[];

  const { data: claims, isLoading } = useQuery({
    queryKey: ['detention-claims', loadId],
    queryFn: () => fetchDetentionClaims(loadId),
  });

  const { data: charges } = useQuery({
    queryKey: ['load-charges', loadId],
    queryFn: () => fetchLoadCharges(loadId),
  });

  const [names, setNames] = useState<Map<string, string>>(new Map());
  const actorKey = useMemo(
    () => Array.from(new Set(rows
      .flatMap(s => [s.arrival_recorded_by, s.departure_recorded_by])
      .filter((v): v is string => !!v))).sort().join(','),
    [rows],
  );
  useEffect(() => {
    let cancelled = false;
    if (!actorKey) { setNames(new Map()); return; }
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .in('id', actorKey.split(','));
      if (cancelled) return;
      setNames(new Map((data ?? []).map(p => [
        p.id, [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || 'dispatch',
      ])));
    })();
    return () => { cancelled = true; };
  }, [actorKey]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['detention-claims', loadId] });

  /* ---- raise ---- */
  const [raiseOpen, setRaiseOpen] = useState(false);
  const [raiseStopId, setRaiseStopId] = useState<string>('');
  const [reportedAt, setReportedAt] = useState<string>(nowNaive);

  const openRaise = () => {
    setRaiseStopId(rows[0]?.id ?? '');
    // Defaults to now because this is normally typed during the call, and stays
    // editable because just as often it is not.
    setReportedAt(nowNaive());
    setRaiseOpen(true);
  };

  const raise = useMutation({
    mutationFn: () => raiseDetentionClaim({
      loadId,
      loadStopId: raiseStopId || null,
      driverReportedAt: reportedAt,
    }),
    onSuccess: () => {
      toast({ title: 'Detention claim opened' });
      setRaiseOpen(false);
      void invalidate();
    },
    onError: (err: Error) =>
      toast({ title: 'Could not open the claim', description: err.message, variant: 'destructive' }),
  });

  /* ---- notification ---- */
  const [notifyClaim, setNotifyClaim] = useState<DetentionClaim | null>(null);
  const [notifiedAt, setNotifiedAt] = useState('');
  const [method, setMethod] = useState<DetentionNotificationMethod | ''>('');

  const openNotify = (claim: DetentionClaim) => {
    setNotifiedAt(detentionToInputValue(claim.broker_notified_at) || nowNaive());
    setMethod(claim.notification_method ?? '');
    setNotifyClaim(claim);
  };

  const notify = useMutation({
    mutationFn: () => recordDetentionNotification({
      claimId: notifyClaim!.id, brokerNotifiedAt: notifiedAt, method,
    }),
    onSuccess: () => {
      toast({ title: 'Broker notification recorded' });
      setNotifyClaim(null);
      void invalidate();
    },
    onError: (err: Error) =>
      toast({ title: 'Could not record the notification', description: err.message, variant: 'destructive' }),
  });

  /* ---- status ---- */
  const [statusClaim, setStatusClaim] = useState<DetentionClaim | null>(null);
  const [nextStatus, setNextStatus] = useState<DetentionClaimStatus | ''>('');
  const [note, setNote] = useState('');
  const [chargeId, setChargeId] = useState<string>('');

  const openStatus = (claim: DetentionClaim) => {
    setNextStatus('');
    setNote(claim.resolution_note ?? '');
    setChargeId(claim.resulting_charge_id ?? '');
    setStatusClaim(claim);
  };

  const advance = useMutation({
    mutationFn: () => advanceDetentionClaimStatus({
      claimId: statusClaim!.id,
      from: statusClaim!.status,
      to: nextStatus as DetentionClaimStatus,
      resolutionNote: note,
      resultingChargeId: chargeId || null,
    }),
    onSuccess: () => {
      toast({ title: 'Claim status updated' });
      setStatusClaim(null);
      void invalidate();
    },
    onError: (err: Error) =>
      toast({ title: 'Could not update the claim', description: err.message, variant: 'destructive' }),
  });

  const list = claims ?? [];

  return (
    <DetailSection
      title={`Detention (${list.length})`}
      action={canManage ? (
        <Button size="sm" variant="outline" onClick={openRaise}>Detention reported</Button>
      ) : null}
    >
      <div className="mb-4">
        <TermsBlock terms={terms} />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading claims…</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No detention claim on this load. Open one when the driver reports sitting —
          detention is negotiated with the broker, and the claim is the record of that chase.
        </p>
      ) : (
        <ul className="space-y-4">
          {list.map(claim => {
            const stop = rows.find(s => s.id === claim.load_stop_id);
            const age = detentionClaimAgeDays(claim);
            const terminal = isTerminalDetentionStatus(claim.status);
            const linked = (charges ?? []).find(c => c.id === claim.resulting_charge_id);
            return (
              <li key={claim.id} className="rounded-lg border border-border bg-background p-3 sm:p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={cn('text-[11px]', STATUS_TONE[claim.status])}>
                    {DETENTION_STATUS_LABELS[claim.status]}
                  </Badge>
                  {age !== null ? (
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 text-[11px]',
                        age >= 2 ? 'text-warning' : 'text-muted-foreground',
                      )}
                    >
                      <Clock className="h-3 w-3" />
                      {age === 0 ? 'Opened today' : `${age} day${age === 1 ? '' : 's'} old`}
                    </span>
                  ) : null}
                  {canManage ? (
                    <span className="ml-auto flex gap-2">
                      {!terminal ? (
                        <Button size="sm" variant="ghost" onClick={() => openNotify(claim)}>
                          {claim.broker_notified_at ? 'Edit notification' : 'Record notification'}
                        </Button>
                      ) : null}
                      {nextDetentionStatuses(claim.status).length > 0 ? (
                        <Button size="sm" variant="outline" onClick={() => openStatus(claim)}>
                          Advance status
                        </Button>
                      ) : null}
                    </span>
                  ) : null}
                </div>

                <div className="mt-2 text-sm text-muted-foreground">
                  Driver reported:{' '}
                  <span className="text-foreground">{formatDateTime(claim.driver_reported_at)}</span>
                  <Zone at={claim.driver_reported_at} />
                  {claim.reported_to_name ? ` · taken by ${claim.reported_to_name}` : null}
                </div>
                <div className="text-sm text-muted-foreground">
                  Broker notified:{' '}
                  {claim.broker_notified_at ? (
                    <>
                      <span className="text-foreground">{formatDateTime(claim.broker_notified_at)}</span>
                      <Zone at={claim.broker_notified_at} />
                      {claim.notification_method
                        ? ` · ${DETENTION_METHOD_LABELS[claim.notification_method]}`
                        : null}
                      {claim.notified_by_name ? ` · by ${claim.notified_by_name}` : null}
                    </>
                  ) : (
                    <span className="font-medium text-warning">Not yet notified</span>
                  )}
                </div>

                {needsNotificationPrompt(terms, claim) ? (
                  <p className="mt-2 flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning/10 p-2 text-[12px] text-warning">
                    <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    These terms require notifying the broker, and no notification has been
                    recorded on this claim.
                  </p>
                ) : null}

                <div className="mt-3">
                  <Evidence stop={stop} names={names} />
                </div>

                {claim.resolution_note ? (
                  <p className="mt-3 whitespace-pre-wrap rounded-md bg-muted/60 p-2 text-sm text-muted-foreground">
                    {claim.resolution_note}
                  </p>
                ) : null}
                {claim.status === 'resolved_revision' ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Resulting charge:{' '}
                    <span className="text-foreground">
                      {linked ? chargeLabel(linked) : claim.resulting_charge_id ? 'Linked' : 'Not linked'}
                    </span>
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {/* Raise */}
      <Dialog open={raiseOpen} onOpenChange={setRaiseOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Detention reported</DialogTitle>
            <DialogDescription>
              Record the driver's call. Detention is negotiated with the broker — this opens the
              claim, it does not create a charge.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Stop</Label>
              <Select value={raiseStopId} onValueChange={setRaiseStopId}>
                <SelectTrigger><SelectValue placeholder="Select a stop" /></SelectTrigger>
                <SelectContent>
                  {rows.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      {`Stop ${s.stop_sequence ?? '?'} · ${STOP_TYPE_LABELS[s.stop_type as StopType]}`
                        + `${s.facility_name ? ` · ${s.facility_name}` : ''}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <StopTimePicker
              id="detention-reported-at"
              label="Driver reported at"
              value={reportedAt}
              onCommit={setReportedAt}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRaiseOpen(false)}>Cancel</Button>
            <Button
              disabled={!reportedAt || raise.isPending}
              onClick={() => raise.mutate()}
            >
              Open claim
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Notification */}
      <Dialog open={!!notifyClaim} onOpenChange={open => !open && setNotifyClaim(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Broker notification</DialogTitle>
            <DialogDescription>
              When the broker was told, and how. Rate confirmations commonly require notice while
              the truck is still on site.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <StopTimePicker
              id="detention-notified-at"
              label="Broker notified at"
              value={notifiedAt}
              onCommit={setNotifiedAt}
            />
            <div className="space-y-1.5">
              <Label>Method</Label>
              <Select
                value={method}
                onValueChange={v => setMethod(v as DetentionNotificationMethod)}
              >
                <SelectTrigger><SelectValue placeholder="Select a method" /></SelectTrigger>
                <SelectContent>
                  {DETENTION_METHODS.map(m => (
                    <SelectItem key={m} value={m}>{DETENTION_METHOD_LABELS[m]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNotifyClaim(null)}>Cancel</Button>
            <Button disabled={notify.isPending} onClick={() => notify.mutate()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Status */}
      <Dialog open={!!statusClaim} onOpenChange={open => !open && setStatusClaim(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Advance claim status</DialogTitle>
            <DialogDescription>
              Most claims end without an answer — record that as abandoned rather than leaving it open.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>New status</Label>
              <Select
                value={nextStatus}
                onValueChange={v => setNextStatus(v as DetentionClaimStatus)}
              >
                <SelectTrigger><SelectValue placeholder="Select a status" /></SelectTrigger>
                <SelectContent>
                  {(statusClaim ? nextDetentionStatuses(statusClaim.status) : []).map(s => (
                    <SelectItem key={s} value={s}>{DETENTION_STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {nextStatus === 'resolved_revision' ? (
              <div className="space-y-1.5">
                <Label>Resulting charge (optional)</Label>
                <Select value={chargeId || 'none'} onValueChange={v => setChargeId(v === 'none' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Not linked" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not linked</SelectItem>
                    {(charges ?? []).map(c => (
                      <SelectItem key={c.id} value={c.id}>{chargeLabel(c)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Linked by hand. Nothing matches a revised rate con's detention line to a claim
                  automatically.
                </p>
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="detention-note">Note (optional)</Label>
              <Textarea
                id="detention-note"
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="What the broker said, or why it was dropped."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusClaim(null)}>Cancel</Button>
            <Button
              disabled={!nextStatus || advance.isPending}
              onClick={() => advance.mutate()}
            >
              Update status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DetailSection>
  );
}
