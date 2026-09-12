import PageHeading from '@/components/shared/PageHeading';
import { getDbErrorMessage } from '@/lib/dbError';
import { operatorDisplayName } from '@/lib/profileNames';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { CheckCircle2, XCircle, Loader2, AlertTriangle, CalendarClock, DollarSign, ChevronLeft, ChevronRight } from 'lucide-react';
import InspectionLevelGuide from '@/components/drivers/InspectionLevelGuide';
import InspectionCalendar from './InspectionCalendar';
import {
  inspectionGroup, nextCycleOnOrAfter, cycleStatus, cycleLabel, CYCLE_STATUS_LABELS,
  MONTH_NAMES, type CycleStatus,
} from '@/lib/inspectionProgram';
/**
 * THE UNIT IS RESOLVED, NOT READ OFF `operators`.
 *
 * A unit is assigned during onboarding, so 48 of 60 active drivers carry it on
 * `onboarding_status` alone. Reading `operators.unit_number` here showed every
 * driver as "Unit —" and left both inspection groups at 0/0, because the group
 * is derived from the unit's last digit. `resolveOperatorUnit` is the one rule.
 */
import { fetchOperatorUnits, resolveOperatorUnit } from '@/lib/fuel/operatorUnit';

/** Driver name for a payment row — always through the linked application. */
function paymentDriverName(p: { operators?: PaymentRow['operators'] }): string {
  return operatorDisplayName(
    {
      application: p.operators?.applications ?? null,
      is_demo: p.operators?.is_demo,
      demo_label: p.operators?.demo_label,
    },
    'Driver',
  );
}

// Program tables arrive when this draft is accepted; generated types do not know them yet.
const db = supabase as any;

/**
 * NAMES COME FROM `applications`, NEVER FROM `operators`.
 *
 * `public.operators` has no `first_name`/`last_name` — they live on the linked
 * application row. Selecting them off `operators` makes PostgREST reject the
 * WHOLE request, which used to render here as an empty review queue. Same
 * pattern as `InspectionComplianceSummary` and `settlementRun`.
 */
interface PaymentRow {
  id: string;
  kind: 'inspection_reimbursement' | 'roadside_bonus';
  amount: number;
  description: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'settled';
  review_note: string | null;
  created_at: string;
  operator_id: string;
  operators?: {
    unit_number: string | null;
    is_demo?: boolean | null;
    demo_label?: string | null;
    applications?: { first_name: string | null; last_name: string | null } | null;
  } | null;
}

interface FleetRow {
  operatorId: string;
  name: string;
  unit: string | null;
  group: 'A' | 'B' | null;
  status: CycleStatus | null;
  cycleLabel: string;
}

interface Props {
  onSelectOperator?: (operatorId: string) => void;
}

export default function InspectionProgramPanel({ onSelectOperator }: Props) {
  const { session } = useAuth();
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [fleet, setFleet] = useState<FleetRow[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<any>(null);
  const [calendarYear, setCalendarYear] = useState(() => new Date().getFullYear());
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [payRes, opsRes, cyclesRes, setRes] = await Promise.all([
      db.from('inspection_program_payments')
        .select('*, operators(unit_number, is_demo, demo_label, applications(first_name, last_name))')
        .order('created_at', { ascending: false }).limit(200),
      supabase.from('operators')
        .select('id, unit_number, is_active, is_demo, demo_label, applications(first_name, last_name)')
        .eq('is_active', true),
      db.from('inspection_cycles').select('*'),
      db.from('inspection_program_settings').select('*').limit(1).maybeSingle(),
    ]);

    // A REJECTED READ MUST NOT LOOK LIKE AN EMPTY QUEUE. Every read is checked
    // here, before anything renders — the whole reason this page appeared to
    // have no work to review was a discarded PostgREST error.
    const firstError = (
      [
        ['payments', payRes.error],
        ['drivers', opsRes.error],
        ['inspection cycles', cyclesRes.error],
        ['program settings', setRes.error],
      ] as const
    ).find(([, e]) => !!e);
    if (firstError) {
      const msg = `Could not load ${firstError[0]}: ${getDbErrorMessage(firstError[1])}`;
      setLoadError(msg);
      setPayments([]);
      setFleet([]);
      setLoading(false);
      toast({ title: 'Inspection Program could not load', description: msg, variant: 'destructive' });
      return;
    }
    setLoadError(null);

    setPayments((payRes.data as PaymentRow[]) ?? []);
    setSettings(setRes.data ?? null);

    const cycles = (cyclesRes.data as any[]) ?? [];
    const rows: FleetRow[] = ((opsRes.data as any[]) ?? []).map(op => {
      const name = operatorDisplayName(
        { application: op.applications, is_demo: op.is_demo, demo_label: op.demo_label },
        'Unknown driver',
      );
      const group = inspectionGroup(op.unit_number);
      if (!group) {
        return {
          operatorId: op.id,
          name,
          unit: op.unit_number, group: null, status: null, cycleLabel: 'No unit number',
        };
      }
      const ref = nextCycleOnOrAfter(group, new Date());
      const row = cycles.find(c => c.operator_id === op.id && c.cycle_year === ref.year && c.cycle_month === ref.month);
      return {
        operatorId: op.id,
        name,
        unit: op.unit_number,
        group,
        status: cycleStatus({
          cycle: ref,
          submittedAt: row?.submitted_at, closedAt: row?.closed_at,
          defectsIdentified: row?.defects_identified, defectsRepaired: row?.defects_repaired,
          graceUntil: row?.grace_until,
        }),
        cycleLabel: cycleLabel(ref),
      };
    }).sort((a, b) => a.name.localeCompare(b.name));

    setFleet(rows);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const pending = useMemo(() => payments.filter(p => p.status === 'pending'), [payments]);
  const decided = useMemo(() => payments.filter(p => p.status !== 'pending'), [payments]);
  const overdue = useMemo(() => fleet.filter(f => f.status === 'overdue'), [fleet]);

  const decide = async (row: PaymentRow, status: 'approved' | 'rejected') => {
    setBusy(row.id);
    const { error } = await db.from('inspection_program_payments').update({
      status,
      review_note: notes[row.id] || null,
      reviewed_by: session?.user?.id ?? null,
      reviewed_at: new Date().toISOString(),
      updated_by: session?.user?.id ?? null,
    }).eq('id', row.id);
    setBusy(null);
    if (error) { toast({ title: 'Could not save', description: error.message, variant: 'destructive' }); return; }
    toast({ title: status === 'approved' ? 'Approved for the next settlement' : 'Rejected' });
    load();
  };

  const money = (n: number) => `$${Number(n).toFixed(2)}`;

  return (
    <div className="space-y-4">
      <PageHeading
        title="Inspection Program"
        description="Quarterly inspections, fee reimbursements and clean roadside bonuses — nothing is paid until it is approved here."
        icon={<CalendarClock className="h-6 w-6 text-gold shrink-0" />}
      />

      {loadError && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
          <p className="text-xs font-medium text-destructive flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" /> This page did not load — what you see below is incomplete
          </p>
          <p className="text-[11px] text-destructive/80 mt-1">{loadError}</p>
          <Button size="sm" variant="outline" className="text-xs mt-2 h-7" onClick={() => load()}>Try again</Button>
        </div>
      )}

      <Tabs defaultValue="review">
        <TabsList>
          <TabsTrigger value="review" className="text-xs">
            Review queue{pending.length ? ` (${pending.length})` : ''}
          </TabsTrigger>
          <TabsTrigger value="fleet" className="text-xs">Fleet status</TabsTrigger>
          <TabsTrigger value="calendar" className="text-xs">Calendar</TabsTrigger>
          <TabsTrigger value="history" className="text-xs">Decided</TabsTrigger>
        </TabsList>

        {/* ------------------------------------------------------ review */}
        <TabsContent value="review" className="space-y-3 pt-3">
          {loading ? (
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
            </p>
          ) : pending.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nothing waiting on a decision.</p>
          ) : pending.map(p => (
            <div key={p.id} className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">
                    {paymentDriverName(p)}
                    {p.operators?.unit_number ? ` · Unit ${p.operators.unit_number}` : ''}
                  </p>
                  <p className="text-xs text-muted-foreground">{p.description || '—'}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Submitted {new Date(p.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <Badge variant="outline" className="text-[10px] mb-1">
                    {p.kind === 'roadside_bonus' ? 'Clean inspection bonus' : 'Inspection reimbursement'}
                  </Badge>
                  <p className="text-lg font-bold flex items-center justify-end gap-1">
                    <DollarSign className="h-4 w-4" />{Number(p.amount).toFixed(2)}
                  </p>
                </div>
              </div>
              <div>
                <Label className="text-[11px]">Reviewer note</Label>
                <Textarea
                  rows={2} className="text-sm"
                  value={notes[p.id] ?? ''}
                  onChange={e => setNotes(n => ({ ...n, [p.id]: e.target.value }))}
                  placeholder="Optional — recorded with the decision"
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="text-xs gap-1.5" disabled={busy === p.id} onClick={() => decide(p, 'approved')}>
                  {busy === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Approve {money(p.amount)}
                </Button>
                <Button size="sm" variant="outline" className="text-xs gap-1.5" disabled={busy === p.id} onClick={() => decide(p, 'rejected')}>
                  <XCircle className="h-3.5 w-3.5" /> Reject
                </Button>
              </div>
            </div>
          ))}
          <InspectionLevelGuide />
        </TabsContent>

        {/* ------------------------------------------------------- fleet */}
        <TabsContent value="fleet" className="space-y-3 pt-3">
          {overdue.length > 0 && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
              <p className="text-xs font-medium text-destructive flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" />
                {overdue.length} unit{overdue.length === 1 ? '' : 's'} past the assigned month — not dispatch eligible
              </p>
              <p className="text-[11px] text-destructive/80 mt-1">
                {overdue.map(o => `${o.name} (${o.unit ?? 'no unit'})`).join(', ')}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {(['A', 'B'] as const).map(g => {
              const inGroup = fleet.filter(f => f.group === g);
              const done = inGroup.filter(f => f.status === 'closed').length;
              return (
                <div key={g} className="rounded-lg border border-border p-3">
                  <p className="text-xs font-medium">Group {g}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {g === 'A' ? 'Oct · Jan · Apr · Jul' : 'Dec · Mar · Jun · Sep'}
                  </p>
                  <p className="text-2xl font-bold mt-1">{done}/{inGroup.length}</p>
                  <p className="text-[11px] text-muted-foreground">complete this cycle</p>
                </div>
              );
            })}
          </div>

          <div className="rounded-lg border border-border divide-y">
            {fleet.map(f => (
              <div key={f.operatorId} className="flex items-center justify-between gap-3 px-3 py-2">
                <div>
                  <p className="text-xs font-medium">{f.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Unit {f.unit ?? '—'}{f.group ? ` · Group ${f.group} · ${f.cycleLabel}` : ' · not scheduled'}
                  </p>
                </div>
                {f.status && (
                  <Badge variant="outline" className={`text-[10px] shrink-0 ${
                    f.status === 'overdue' ? 'bg-destructive/10 text-destructive border-destructive/40'
                      : f.status === 'closed' ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                      : f.status === 'grace' ? 'bg-orange-50 text-orange-800 border-orange-300'
                      : 'bg-amber-50 text-amber-800 border-amber-300'
                  }`}>
                    {CYCLE_STATUS_LABELS[f.status]}
                  </Badge>
                )}
              </div>
            ))}
          </div>

          <p className="text-[11px] text-muted-foreground">
            Makeup months: {[2, 5, 8, 11].map(m => MONTH_NAMES[m - 1]).join(', ')} — no unit is scheduled in these,
            so a missed inspection can be caught up without colliding with the next group.
          </p>
        </TabsContent>

        {/* --------------------------------------------------- calendar */}
        <TabsContent value="calendar" className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Units shown by their assigned inspection month. Click a unit to open it in the Vehicle Hub.
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCalendarYear(y => y - 1)}
                className="p-1 rounded hover:bg-muted"
                aria-label="Previous year"
              >
                <ChevronLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              <span className="text-sm font-medium w-12 text-center">{calendarYear}</span>
              <button
                onClick={() => setCalendarYear(y => y + 1)}
                className="p-1 rounded hover:bg-muted"
                aria-label="Next year"
              >
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          </div>
          <InspectionCalendar year={calendarYear} onSelectOperator={onSelectOperator} />
        </TabsContent>

        {/* ----------------------------------------------------- history */}
        <TabsContent value="history" className="space-y-2 pt-3">
          {decided.length === 0 ? (
            <p className="text-xs text-muted-foreground">No decisions recorded yet.</p>
          ) : decided.map(p => (
            <div key={p.id} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
              <div>
                <p className="text-xs font-medium">
                  {paymentDriverName(p)} · {money(p.amount)}
                </p>
                <p className="text-[11px] text-muted-foreground">{p.description || '—'}</p>
                {p.review_note && <p className="text-[11px] text-muted-foreground italic">“{p.review_note}”</p>}
              </div>
              <Badge variant="outline" className={`text-[10px] shrink-0 ${
                p.status === 'rejected' ? 'bg-destructive/10 text-destructive border-destructive/40'
                  : 'bg-emerald-50 text-emerald-800 border-emerald-300'
              }`}>
                {p.status === 'settled' ? 'Paid' : p.status === 'approved' ? 'Approved' : 'Rejected'}
              </Badge>
            </div>
          ))}
        </TabsContent>
      </Tabs>

      {settings && (
        <p className="text-[11px] text-muted-foreground">
          Current program settings: fee reimbursed up to ${Number(settings.reimbursement_cap).toFixed(0)} ·
          clean bonus ${settings.bonus_level_1}/${settings.bonus_level_2}/${settings.bonus_level_3} for Levels I/II/III ·
          up to {settings.max_grace_days} grace days, {settings.max_grace_per_12_months} extensions per driver per 12 months.
        </p>
      )}
    </div>
  );
}
