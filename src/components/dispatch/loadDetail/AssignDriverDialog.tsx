import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import DriverCombobox from '@/components/shared/DriverCombobox';
import { toast } from '@/hooks/use-toast';
import { getDbErrorMessage, logDbError } from '@/lib/dbError';
import {
  assignLoadDriver, fetchAssignableDrivers, fetchDriverEligibilityBulk,
  type DriverEligibility, type EligibilityIssue,
} from '@/lib/loadDetail';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loadId: string;
  currentOperatorId: string | null;
  canOverride: boolean;
}

function IssueList({ issues, tone }: { issues: EligibilityIssue[]; tone: 'block' | 'warn' }) {
  const Icon = tone === 'block' ? XCircle : AlertTriangle;
  return (
    <ul className="space-y-1.5">
      {issues.map(i => (
        <li key={i.code} className="flex items-start gap-2 text-sm">
          <Icon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{i.message}</span>
        </li>
      ))}
    </ul>
  );
}

export default function AssignDriverDialog({
  open, onOpenChange, loadId, currentOperatorId, canOverride,
}: Props) {
  const queryClient = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setSelectedUserId('');
      setReason('');
    }
  }, [open]);

  const { data: drivers = [], isLoading: driversLoading } = useQuery({
    queryKey: ['assignable-drivers'],
    enabled: open,
    queryFn: fetchAssignableDrivers,
  });

  const operatorIds = useMemo(() => drivers.map(d => d.operatorId), [drivers]);

  const { data: eligibility = {}, isLoading: eligLoading } = useQuery({
    queryKey: ['driver-eligibility', operatorIds],
    enabled: open && operatorIds.length > 0,
    queryFn: () => fetchDriverEligibilityBulk(operatorIds),
  });

  const selected = drivers.find(d => d.userId === selectedUserId) ?? null;
  const result: DriverEligibility | null =
    selected ? (eligibility as Record<string, DriverEligibility>)[selected.operatorId] ?? null : null;
  const blocking = result?.blocking ?? [];
  const warnings = result?.warnings ?? [];
  const hasBlocking = blocking.length > 0;

  const options = useMemo(() => drivers.map(d => {
    const e = (eligibility as Record<string, DriverEligibility>)[d.operatorId];
    return {
      userId: d.userId,
      name: d.name,
      unitNumber: d.unitNumber,
      isActive: d.isActive,
      status: !e ? undefined : e.blocking.length ? 'blocked' as const
        : e.warnings.length ? 'warning' as const : 'eligible' as const,
      statusDetail: !e ? undefined
        : (e.blocking.length ? e.blocking : e.warnings).map(i => i.message),
    };
  }), [drivers, eligibility]);

  const confirmDisabled =
    !selected || saving || eligLoading ||
    selected.operatorId === currentOperatorId ||
    (hasBlocking && (!canOverride || !reason.trim()));

  const handleConfirm = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await assignLoadDriver(loadId, selected.operatorId, hasBlocking ? reason : null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['load-detail', loadId] }),
        queryClient.invalidateQueries({ queryKey: ['load-status-history', loadId] }),
        queryClient.invalidateQueries({ queryKey: ['dispatch-loads'] }),
      ]);
      toast({
        title: `${selected.name} assigned`,
        description: res?.auto_advanced
          ? 'The load was automatically advanced to Covered.'
          : undefined,
      });
      onOpenChange(false);
    } catch (err) {
      logDbError('assign_load_driver', err, { loadId, operatorId: selected.operatorId });
      toast({
        title: 'Driver not assigned',
        description: getDbErrorMessage(err, 'Could not assign the driver.'),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{currentOperatorId ? 'Reassign Driver' : 'Assign Driver'}</DialogTitle>
          <DialogDescription>
            Compliance is checked before the driver is assigned.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Driver</Label>
            <DriverCombobox
              operators={options}
              value={selectedUserId}
              onChange={setSelectedUserId}
              placeholder={driversLoading ? 'Loading drivers…' : 'Search by name or unit #…'}
              triggerClassName="w-full"
            />
          </div>

          {selected && eligLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking eligibility…
            </div>
          ) : null}

          {selected && !eligLoading && result ? (
            <div className="space-y-3">
              {hasBlocking ? (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-destructive">
                  <p className="mb-1.5 text-sm font-semibold">Blocking issues</p>
                  <IssueList issues={blocking} tone="block" />
                </div>
              ) : (
                <div className="flex items-start gap-2 rounded-lg border border-emerald-600/40 bg-emerald-600/10 p-3 text-sm text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{selected.name} is eligible for assignment.</span>
                </div>
              )}

              {warnings.length ? (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-amber-700 dark:text-amber-400">
                  <p className="mb-1.5 text-sm font-semibold">Warnings</p>
                  <IssueList issues={warnings} tone="warn" />
                </div>
              ) : null}

              {hasBlocking && canOverride ? (
                <div className="space-y-1.5">
                  <Label htmlFor="override-reason">Override reason</Label>
                  <Textarea
                    id="override-reason"
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    placeholder="Explain why this assignment is being made despite the issues above."
                    rows={3}
                  />
                </div>
              ) : null}

              {hasBlocking && !canOverride ? (
                <p className="text-sm text-muted-foreground">
                  Management approval is required to override these issues.
                </p>
              ) : null}

              {selected.operatorId === currentOperatorId ? (
                <p className="text-sm text-muted-foreground">
                  This driver is already assigned to the load.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant={hasBlocking ? 'destructive' : 'default'}
            onClick={handleConfirm}
            disabled={confirmDisabled}
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {hasBlocking ? 'Override and Assign' : 'Assign Driver'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
