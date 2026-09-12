import PageHeading from '@/components/shared/PageHeading';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AlertTriangle, Loader2, History, ShieldCheck } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { operatorDisplayName } from '@/lib/profileNames';
import { formatDateMDY } from '@/lib/dateDisplay';
import {
  groupSharedPlates,
  normalizePlate,
  plateKey,
  type PlateGroup,
  type PlateHolder,
} from '@/lib/duplicatePlates';

interface PlateHistoryRow {
  id: string;
  operator_id: string;
  unit_number: string | null;
  plate_number: string;
  plate_state: string | null;
  replaced_by_plate: string | null;
  replaced_by_state: string | null;
  action: string;
  reason: string;
  changed_by_name: string | null;
  created_at: string;
}

type PendingAction = {
  holder: PlateHolder;
  group: PlateGroup;
  mode: 'clear' | 'replace';
};

export default function DuplicatePlatesPanel() {
  const { isManagement } = useAuth();
  const canWrite = isManagement;

  const [loading, setLoading] = useState(true);
  const [holders, setHolders] = useState<PlateHolder[]>([]);
  const [history, setHistory] = useState<PlateHistoryRow[]>([]);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [reason, setReason] = useState('');
  const [newPlate, setNewPlate] = useState('');
  const [newState, setNewState] = useState('');
  const [saving, setSaving] = useState(false);
  const [showResolved, setShowResolved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [opsRes, onbRes, profRes] = await Promise.all([
        supabase.from('operators').select('id, user_id, unit_number, is_active, is_demo, demo_label'),
        supabase
          .from('onboarding_status')
          .select('operator_id, unit_number, truck_year, truck_make, truck_vin, truck_plate, truck_plate_state'),
        supabase.from('profiles').select('user_id, first_name, last_name'),
      ]);
      if (opsRes.error) throw opsRes.error;
      if (onbRes.error) throw onbRes.error;
      if (profRes.error) throw profRes.error;

      const onbByOperator = new Map((onbRes.data ?? []).map(o => [o.operator_id, o]));
      const profByUser = new Map((profRes.data ?? []).map(p => [p.user_id, p]));

      const rows: PlateHolder[] = (opsRes.data ?? []).map((op) => {
        const os = onbByOperator.get(op.id);
        const prof = op.user_id ? profByUser.get(op.user_id) : null;
        return {
          operatorId: op.id,
          driverName: operatorDisplayName({
            profile: prof ?? null,
            is_demo: op.is_demo,
            demo_label: op.demo_label,
          }, 'Unnamed driver'),
          unitNumber: os?.unit_number || op.unit_number || null,
          truckYear: os?.truck_year ?? null,
          truckMake: os?.truck_make ?? null,
          truckVin: os?.truck_vin ?? null,
          truckPlate: os?.truck_plate ?? null,
          truckPlateState: os?.truck_plate_state ?? null,
          isActive: !!op.is_active,
        };
      });
      setHolders(rows);

      // Staged table — not yet present in the generated types.
      const { data: hist } = await (supabase as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            order: (c: string, o: { ascending: boolean }) => Promise<{ data: PlateHistoryRow[] | null }>;
          };
        };
      })
        .from('truck_plate_history')
        .select('*')
        .order('created_at', { ascending: false });
      setHistory(hist ?? []);
    } catch (err) {
      toast({
        title: 'Could not load plates',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const groups = useMemo(() => groupSharedPlates(holders), [holders]);

  /** Plates that were shared and no longer are — reachable, not buried. */
  const resolvedGroups = useMemo(() => {
    const openKeys = new Set(groups.map(g => g.key));
    const byKey = new Map<string, PlateHistoryRow[]>();
    history.forEach(h => {
      const key = plateKey(h.plate_number, h.plate_state);
      if (openKeys.has(key)) return;
      byKey.set(key, [...(byKey.get(key) ?? []), h]);
    });
    return [...byKey.entries()];
  }, [groups, history]);

  const historyFor = useCallback(
    (operatorId: string) => history.filter(h => h.operator_id === operatorId),
    [history],
  );

  const openAction = (group: PlateGroup, holder: PlateHolder, mode: 'clear' | 'replace') => {
    setPending({ group, holder, mode });
    setReason('');
    setNewPlate('');
    setNewState(holder.truckPlateState ?? '');
  };

  const submit = async () => {
    if (!pending) return;
    if (!reason.trim()) {
      toast({ title: 'A reason is required', variant: 'destructive' });
      return;
    }
    if (pending.mode === 'replace' && !normalizePlate(newPlate)) {
      toast({ title: 'Enter the plate this truck carries', variant: 'destructive' });
      return;
    }
    if (pending.mode === 'replace') {
      const clash = holders.find(
        h => h.operatorId !== pending.holder.operatorId &&
          plateKey(h.truckPlate, h.truckPlateState) === plateKey(newPlate, newState),
      );
      if (clash) {
        toast({
          title: 'That plate is already in use',
          description: `${clash.driverName} — Unit ${clash.unitNumber ?? '—'}`,
          variant: 'destructive',
        });
        return;
      }
    }

    setSaving(true);
    try {
      // Staged writer — not yet present in the generated types.
      const { error } = await (supabase as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
      }).rpc('resolve_shared_truck_plate', {
        _operator_id: pending.holder.operatorId,
        _new_plate: pending.mode === 'clear' ? null : newPlate.trim().toUpperCase(),
        _new_state: pending.mode === 'clear' ? null : (newState.trim().toUpperCase() || null),
        _reason: reason.trim(),
      });
      if (error) throw new Error(error.message);
      toast({
        title: pending.mode === 'clear' ? 'Plate cleared' : 'Plate updated',
        description: `${pending.holder.driverName} — Unit ${pending.holder.unitNumber ?? '—'}`,
      });
      setPending(null);
      await load();
    } catch (err) {
      toast({
        title: 'Could not save',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading plates…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeading
        title="Duplicate Plates"
        description={groups.length === 0
          ? 'No plate is on more than one driver.'
          : `${groups.length} plate${groups.length === 1 ? '' : 's'} on more than one driver.`}
      />

      {!canWrite && groups.length > 0 && (
        <div className="rounded-lg border p-3 text-sm text-muted-foreground">
          You can review these, but only management can change a plate.
        </div>
      )}

      {groups.map(group => (
        <div key={group.key} className="rounded-lg border overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b bg-muted/40">
            <span className="font-mono font-semibold">
              {group.plate}{group.plateState ? ` (${group.plateState})` : ''}
            </span>
            {group.kind === 'mixed' && (
              <Badge className="bg-amber-100 text-amber-800 border-amber-300">Needs a decision</Badge>
            )}
            {group.kind === 'both_active' && (
              <Badge variant="destructive">Both drivers active</Badge>
            )}
            {group.kind === 'all_deactivated' && (
              <Badge variant="outline">All off the roster</Badge>
            )}
            <span className="text-xs text-muted-foreground ml-auto">
              {group.holders.length} drivers
            </span>
          </div>

          {group.kind === 'both_active' && (
            <div className="flex items-start gap-2 px-4 py-2 text-xs text-destructive border-b">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              Neither driver is off the roster, so one of these live trucks most likely
              has the wrong plate typed on it.
            </div>
          )}

          <div className="divide-y">
            {group.holders.map(holder => {
              const past = historyFor(holder.operatorId);
              return (
                <div key={holder.operatorId} className="px-4 py-3 flex flex-wrap gap-3 items-start">
                  <div className="min-w-[220px] flex-1">
                    <div className="font-medium">{holder.driverName}</div>
                    <div className="text-xs text-muted-foreground">
                      Unit {holder.unitNumber ?? '—'}
                      {holder.truckYear || holder.truckMake
                        ? ` · ${[holder.truckYear, holder.truckMake].filter(Boolean).join(' ')}`
                        : ''}
                      {' · '}
                      {holder.isActive ? 'active' : 'deactivated'}
                    </div>
                    {past.length > 0 && (
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        <History className="h-3 w-3 inline mr-1" />
                        Previously on this truck:{' '}
                        {past
                          .map(h => `${h.plate_number}${h.replaced_by_plate ? ` → ${h.replaced_by_plate}` : ' (cleared)'} on ${formatDateMDY(h.created_at)}`)
                          .join('; ')}
                      </div>
                    )}
                  </div>

                  {canWrite && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openAction(group, holder, 'clear')}
                      >
                        Clear the plate
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openAction(group, holder, 'replace')}
                      >
                        Enter the right plate
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {resolvedGroups.length > 0 && (
        <div className="rounded-lg border">
          <button
            type="button"
            className="w-full text-left px-4 py-3 text-sm font-medium flex items-center gap-2"
            onClick={() => setShowResolved(v => !v)}
          >
            <ShieldCheck className="h-4 w-4" />
            Resolved plates ({resolvedGroups.length})
          </button>
          {showResolved && (
            <div className="divide-y border-t">
              {resolvedGroups.map(([key, rows]) => (
                <div key={key} className="px-4 py-3 text-sm">
                  <span className="font-mono font-medium">{rows[0].plate_number}</span>
                  <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                    {rows.map(r => (
                      <li key={r.id}>
                        Unit {r.unit_number ?? '—'} —{' '}
                        {r.action === 'cleared' ? 'plate cleared' : `changed to ${r.replaced_by_plate}`}
                        {' · '}{formatDateMDY(r.created_at)}
                        {r.changed_by_name ? ` · ${r.changed_by_name}` : ''}
                        {' · '}“{r.reason}”
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <AlertDialog open={!!pending} onOpenChange={(o) => { if (!o && !saving) setPending(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.mode === 'clear' ? 'Clear this plate' : 'Enter the right plate'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.holder.driverName} — Unit {pending?.holder.unitNumber ?? '—'} currently
              shows {pending?.group.plate}. The change is recorded with your name, the date and
              your reason.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3">
            {pending?.mode === 'replace' && (
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <Label>Plate this truck carries</Label>
                  <Input
                    className="mt-1 font-mono uppercase"
                    value={newPlate}
                    onChange={e => setNewPlate(e.target.value.toUpperCase())}
                    placeholder="e.g. 05KT2W"
                  />
                </div>
                <div>
                  <Label>State</Label>
                  <Input
                    className="mt-1 uppercase"
                    value={newState}
                    onChange={e => setNewState(e.target.value.toUpperCase())}
                    placeholder="MO"
                    maxLength={2}
                  />
                </div>
              </div>
            )}
            <div>
              <Label>Reason <span className="text-destructive">*</span></Label>
              <Textarea
                className="mt-1 resize-none"
                rows={3}
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="e.g. Plate moved to unit 193 in July; old record still showed it."
              />
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <Button onClick={submit} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
