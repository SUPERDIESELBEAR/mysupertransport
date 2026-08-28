import { useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ToastAction } from '@/components/ui/toast';
import { useToast } from '@/hooks/use-toast';
import { useDemoMode } from '@/hooks/useDemoMode';
import {
  canonicalSerial,
  describeSerialDiff,
  editDistance,
  findSerialMatches,
  mergeEquipmentItems,
  normalizeSerial,
  SERIAL_DASH_MESSAGE,
  serialHasDash,
} from '@/lib/equipmentSync';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import SerialDiffText from './SerialDiffText';
import type { EquipmentItem, DeviceType } from './EquipmentInventory';

const DEVICE_LABEL: Record<DeviceType, string> = {
  eld: 'ELD',
  dash_cam: 'Dash Camera',
  bestpass: 'BestPass',
  fuel_card: 'Fuel Card',
};

const DISMISS_KEY = 'onboard_systems_serial_conflicts_dismissed';

function readDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeDismissed(next: Set<string>) {
  try {
    localStorage.setItem(DISMISS_KEY, JSON.stringify(Array.from(next)));
  } catch {
    /* non-critical */
  }
}

interface Conflict {
  key: string;
  deviceType: DeviceType;
  items: EquipmentItem[];
  /** 'confusable' = same device once look-alike characters fold; 'near' = one character apart. */
  kind: 'confusable' | 'near';
}

/**
 * Surfaces inventory records that are really the same physical device — their
 * serials match once the confusable characters (O/0, I/1, L/1, S/5) are folded.
 * Staff picks which record is correct; the other is merged into it.
 */
export default function SerialConflictsPanel({
  items,
  onResolved,
}: {
  items: EquipmentItem[];
  onResolved: () => void;
}) {
  const { toast } = useToast();
  const { guardDemo } = useDemoMode();
  const [expanded, setExpanded] = useState(true);
  const [dismissed, setDismissed] = useState<Set<string>>(() => readDismissed());
  const [working, setWorking] = useState<string | null>(null);
  const [pending, setPending] = useState<{ conflict: Conflict; survivor: EquipmentItem } | null>(null);
  /** Which serial the merged record should end up with: a record's id, or 'custom'. */
  const [serialChoice, setSerialChoice] = useState<string>('');
  const [customSerial, setCustomSerial] = useState('');

  const openConfirm = (conflict: Conflict, survivor: EquipmentItem) => {
    setSerialChoice(survivor.id);
    setCustomSerial('');
    setPending({ conflict, survivor });
  };

  const allPairs = useMemo<Conflict[]>(() => {
    const live = items.filter(i => i.status !== 'deactivated' && canonicalSerial(i.serial_number));
    const groups = new Map<string, EquipmentItem[]>();
    for (const item of live) {
      const key = `${item.device_type}:${canonicalSerial(item.serial_number)}`;
      const arr = groups.get(key) ?? [];
      arr.push(item);
      groups.set(key, arr);
    }
    const confusable: Conflict[] = Array.from(groups.entries())
      .filter(([, group]) => group.length > 1)
      .map(([key, group]) => ({
        key,
        deviceType: group[0].device_type,
        items: group,
        kind: 'confusable' as const,
      }));

    // Second net: serials one character apart (a dropped or added digit), which
    // confusable folding can never catch. Softer signal — these may be genuinely
    // different devices, so staff decides.
    const claimed = new Set(confusable.flatMap(c => c.items.map(i => i.id)));
    const near: Conflict[] = [];
    const candidates = live.filter(i => !claimed.has(i.id));
    for (let a = 0; a < candidates.length; a++) {
      for (let b = a + 1; b < candidates.length; b++) {
        const x = candidates[a];
        const y = candidates[b];
        if (x.device_type !== y.device_type) continue;
        const cx = canonicalSerial(x.serial_number)!;
        const cy = canonicalSerial(y.serial_number)!;
        if (Math.min(cx.length, cy.length) < 6) continue;
        if (editDistance(cx, cy) !== 1) continue;
        near.push({
          key: `near:${x.device_type}:${[x.id, y.id].sort().join(':')}`,
          deviceType: x.device_type,
          items: [x, y],
          kind: 'near',
        });
      }
    }
    return [...confusable, ...near];
  }, [items]);

  const conflicts = allPairs.filter(c => !dismissed.has(c.key));
  const hiddenCount = allPairs.length - conflicts.length;

  const applyDismissed = (next: Set<string>) => {
    setDismissed(next);
    writeDismissed(next);
  };

  const dismiss = (key: string) => {
    const next = new Set(dismissed);
    next.add(key);
    applyDismissed(next);
    toast({
      title: 'Marked as different devices',
      description: 'This pair is hidden on this browser only.',
      action: (
        <ToastAction
          altText="Undo"
          onClick={() => {
            const restored = new Set(next);
            restored.delete(key);
            applyDismissed(restored);
          }}
        >
          Undo
        </ToastAction>
      ),
    });
  };

  const restoreAll = () => {
    const next = new Set(dismissed);
    for (const pair of allPairs) next.delete(pair.key);
    applyDismissed(next);
  };

  if (conflicts.length === 0 && hiddenCount === 0) return null;

  if (conflicts.length === 0) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>
          {hiddenCount} pair{hiddenCount !== 1 ? 's' : ''} marked as different devices
        </span>
        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={restoreAll}>
          Show
        </Button>
      </div>
    );
  }

  const merge = async (conflict: Conflict, survivor: EquipmentItem, correctedSerial?: string | null) => {
    if (guardDemo()) return;
    setWorking(conflict.key);
    try {
      const corrected = normalizeSerial(correctedSerial);
      if (corrected && corrected !== normalizeSerial(survivor.serial_number)) {
        const otherIds = new Set(conflict.items.map(i => i.id));
        const matches = (await findSerialMatches(conflict.deviceType, corrected)).filter(
          m => !otherIds.has(m.id) && m.kind === 'collision',
        );
        if (matches.length > 0) {
          throw new Error(
            `${corrected} already exists in inventory${matches[0].holderName ? ` on ${matches[0].holderName}` : ''}.`,
          );
        }
      }
      for (const loser of conflict.items) {
        if (loser.id === survivor.id) continue;
        await mergeEquipmentItems(survivor, loser, { correctedSerial: corrected });
      }
      toast({
        title: `Kept ${corrected ?? survivor.serial_number}`,
        description: corrected && corrected !== normalizeSerial(survivor.serial_number)
          ? `The duplicate was merged in and the serial was corrected from ${survivor.serial_number}.`
          : 'The duplicate record was merged in.',
      });
      setPending(null);
      onResolved();
    } catch (err: unknown) {
      toast({
        title: 'Merge failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setWorking(null);
    }
  };


  return (
    <div className="border border-destructive/30 bg-destructive/5 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-foreground">
            {conflicts.length} serial conflict{conflicts.length !== 1 ? 's' : ''} to review
          </span>
          <span className="block text-xs text-muted-foreground">
            Records that look like one device entered twice — either look-alike characters, or a single dropped or
            added digit.
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="divide-y divide-destructive/20 border-t border-destructive/20">
          {conflicts.map(conflict => (
            <div key={conflict.key} className="p-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {DEVICE_LABEL[conflict.deviceType]}
                {conflict.kind === 'near' ? ' · one character apart' : ' · look-alike characters'}
              </p>
              {conflict.kind === 'near' ? (
                <p className="text-xs text-muted-foreground">
                  These serials are one character apart, which is usually a mistyped digit — but they could be two real
                  devices. Check the labels before merging.
                </p>
              ) : (
                describeSerialDiff(conflict.items[0].serial_number, conflict.items[1]?.serial_number) && (
                  <p className="text-xs text-muted-foreground">
                    {describeSerialDiff(conflict.items[0].serial_number, conflict.items[1]?.serial_number)}
                  </p>
                )
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                {conflict.items.map(item => (
                  <div key={item.id} className="rounded-lg border border-border bg-card p-3 space-y-2">
                    <p className="text-sm text-foreground">
                      <SerialDiffText
                        value={item.serial_number}
                        against={(conflict.items.find(o => o.id !== item.id) ?? item).serial_number}
                      />
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.current_operator_name
                        ? `Assigned to ${item.current_unit_number ? `Unit ${item.current_unit_number} · ` : ''}${item.current_operator_name}`
                        : item.last_operator_name
                          ? `Last held by ${item.last_operator_name}`
                          : 'Unassigned'}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs w-full"
                      disabled={working !== null}
                      onClick={() => openConfirm(conflict, item)}
                    >
                      {working === conflict.key ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        'Keep this record'
                      )}
                    </Button>
                  </div>
                ))}
              </div>
              <p className="text-xs font-medium text-foreground">
                Next you'll confirm which serial number is right — you can keep either number or type a corrected one.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-3 text-xs text-muted-foreground border-border hover:bg-gold/10 hover:text-gold hover:border-gold"
                disabled={working !== null}
                onClick={() => dismiss(conflict.key)}
              >
                These are different devices
              </Button>
            </div>
          ))}
        </div>
      )}

      {hiddenCount > 0 && (
        <div className="flex items-center gap-2 border-t border-destructive/20 px-4 py-2 text-xs text-muted-foreground">
          <span>
            {hiddenCount} pair{hiddenCount !== 1 ? 's' : ''} marked as different devices
          </span>
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={restoreAll}>
            Show
          </Button>
        </div>
      )}

      <AlertDialog
        open={pending !== null}
        onOpenChange={open => {
          if (!open && working === null) setPending(null);
        }}
      >
        <AlertDialogContent>
          {pending && (() => {
            const { conflict, survivor } = pending;
            const losers = conflict.items.filter(i => i.id !== survivor.id);
            const sameDriver =
              conflict.items.every(
                i =>
                  i.current_operator_name &&
                  i.current_operator_name === survivor.current_operator_name &&
                  i.current_unit_number === survivor.current_unit_number,
              ) && !!survivor.current_operator_name;
            const holder = (i: EquipmentItem) =>
              i.current_operator_name
                ? `${i.current_unit_number ? `Unit ${i.current_unit_number} · ` : ''}${i.current_operator_name}`
                : i.last_operator_name
                  ? `last held by ${i.last_operator_name}`
                  : 'unassigned';
            const chosenRaw =
              serialChoice === 'custom'
                ? customSerial
                : (conflict.items.find(i => i.id === serialChoice)?.serial_number ?? survivor.serial_number);
            const chosen = normalizeSerial(chosenRaw);
            const survivorSerial = normalizeSerial(survivor.serial_number);
            const isCorrection = !!chosen && chosen !== survivorSerial;
            const customError =
              serialChoice !== 'custom'
                ? null
                : serialHasDash(customSerial)
                  ? SERIAL_DASH_MESSAGE
                  : !chosen
                    ? 'Enter the correct serial number'
                    : null;
            const holderLabel = survivor.current_operator_name ?? holder(survivor);
            return (
              <>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Keep this {DEVICE_LABEL[conflict.deviceType]} on{' '}
                    <span className="font-medium">{holderLabel}</span>?
                  </AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="space-y-2 text-left">
                      <p>
                        This {DEVICE_LABEL[conflict.deviceType]} stays on{' '}
                        <span className="font-medium text-foreground">{holder(survivor)}</span>.
                      </p>
                      {losers.map(loser => (
                        <p key={loser.id}>
                          {sameDriver ? (
                            <>
                              The duplicate record{' '}
                              <SerialDiffText
                                value={loser.serial_number}
                                against={survivor.serial_number}
                                className="text-foreground"
                              />{' '}for the same
                              driver and unit will be merged in and removed. No driver loses a device.
                            </>
                          ) : (
                            <>
                              <SerialDiffText
                                value={loser.serial_number}
                                against={survivor.serial_number}
                                className="text-foreground"
                              />{' '}(
                              {holder(loser)}) will be merged in — that assignment is closed and the serial is cleared
                              from{' '}
                              <span className="font-medium text-foreground">
                                {loser.current_operator_name ?? 'that record'}
                              </span>
                              's onboarding record.
                            </>
                          )}
                        </p>
                      ))}
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>

                <div className="space-y-2 rounded-lg border border-border p-3">
                  <p className="text-sm font-medium text-foreground">Which number is correct?</p>
                  <RadioGroup value={serialChoice} onValueChange={setSerialChoice} className="space-y-2">
                    {conflict.items.map(item => (
                      <div key={item.id} className="flex items-start gap-2">
                        <RadioGroupItem value={item.id} id={`serial-${item.id}`} className="mt-0.5" />
                        <Label htmlFor={`serial-${item.id}`} className="cursor-pointer font-normal">
                          <SerialDiffText
                            value={item.serial_number}
                            against={(conflict.items.find(o => o.id !== item.id) ?? item).serial_number}
                          />
                          <span className="ml-2 text-xs text-muted-foreground">
                            {item.id === survivor.id ? 'on this record' : `from ${holder(item)}`}
                          </span>
                        </Label>
                      </div>
                    ))}
                    <div className="flex items-start gap-2">
                      <RadioGroupItem value="custom" id="serial-custom" className="mt-0.5" />
                      <Label htmlFor="serial-custom" className="cursor-pointer font-normal">
                        Neither — type the correct number
                      </Label>
                    </div>
                  </RadioGroup>
                  {serialChoice === 'custom' && (
                    <div className="space-y-1">
                      <Input
                        autoFocus
                        value={customSerial}
                        onChange={e => setCustomSerial(e.target.value.toUpperCase())}
                        placeholder="Serial number"
                        className="font-mono"
                      />
                      {customError && <p className="text-xs text-destructive">{customError}</p>}
                    </div>
                  )}
                  {isCorrection && !customError && (
                    <p className="text-xs text-muted-foreground">
                      {holderLabel} keeps this device, and the number on their record is corrected from{' '}
                      <span className="font-mono text-foreground">{survivor.serial_number}</span> to{' '}
                      <span className="font-mono text-foreground">{chosen}</span>.
                    </p>
                  )}
                </div>

                <AlertDialogFooter>
                  <AlertDialogCancel disabled={working !== null}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={working !== null || !!customError || !chosen}
                    onClick={e => {
                      e.preventDefault();
                      void merge(conflict, survivor, chosen);
                    }}
                  >
                    {working === conflict.key ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : isCorrection ? (
                      'Merge and correct serial'
                    ) : (
                      'Keep this serial'
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </>
            );

          })()}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
