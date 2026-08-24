import { useCallback, useRef, useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { toast } from '@/hooks/use-toast';
import { LOAD_TYPE_LABELS, type LoadType } from '@/lib/loadRateMath';
import { planLoadTypeCarry } from '@/lib/loadTypeCarry';
import { deriveUseWindowFromStops } from '@/lib/loadoutUseWindow';
import type { LoadFormValues } from '@/pages/dispatch/loadFormSchema';

/**
 * The one place a load type changes.
 *
 * Two callers used to write `load_type`: the Load Type buttons, which carried
 * the parsed amount across, and the parser's loadout banner, which did not — so
 * the same document's $150 became a relocation fee from one control and $0.00
 * from the other. A correct rule reachable from one caller and not the other is
 * the recurring failure here, so the change is a single operation both callers
 * invoke: carry, dependent fields, and undo all belong to it.
 */

/** Every field the loadout banner may fill, so an undo knows what to restore. */
export const LOADOUT_FIELDS = [
  'loadout_trailer_owner_company',
  'loadout_trailer_owner_contact',
  'loadout_trailer_number',
  'loadout_trailer_vin',
  'loadout_trailer_type',
  'loadout_relocation_fee',
  'loadout_use_period_days',
  // The agreed trailer use window is read off the document like any other
  // loadout field. Because undo restores a snapshot rather than inferring what
  // to reverse, these need no special casing — they are simply tracked.
  'loadout_use_start',
  'loadout_use_end',
  // Provenance is part of the window, not a separate decision: whoever writes
  // the dates writes where they came from, so a derived window can never be
  // saved as if the broker had stated it.
  'loadout_use_window_source',
] as const;

export type LoadoutField = typeof LOADOUT_FIELDS[number];

/** Fields a type change can touch, snapshotted before and after. */
export const LOAD_TYPE_TRACKED_FIELDS = ['load_type', 'linehaul_rate', ...LOADOUT_FIELDS] as const;
type TrackedField = typeof LOAD_TYPE_TRACKED_FIELDS[number];

export type LoadTypeSnapshot = Record<TrackedField, unknown>;

export interface LoadTypeChange {
  from: LoadType;
  to: LoadType;
  before: LoadTypeSnapshot;
  after: LoadTypeSnapshot;
}

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));

export function useLoadTypeChange(form: UseFormReturn<LoadFormValues>) {
  const [lastChange, setLastChange] = useState<LoadTypeChange | null>(null);
  const [undone, setUndone] = useState<LoadTypeChange | null>(null);
  const busy = useRef(false);

  const snapshot = useCallback((): LoadTypeSnapshot => {
    const out = {} as LoadTypeSnapshot;
    LOAD_TYPE_TRACKED_FIELDS.forEach(f => { out[f] = form.getValues(f as never); });
    return out;
  }, [form]);

  const restore = useCallback((snap: LoadTypeSnapshot) => {
    LOAD_TYPE_TRACKED_FIELDS.forEach(f => {
      form.setValue(f as never, (snap[f] ?? '') as never, { shouldDirty: true });
    });
  }, [form]);

  /**
   * Changes the load type, carrying the amount, and applying any fields the
   * caller read off the document as part of the same reversible operation.
   */
  const changeLoadType = useCallback((
    to: LoadType,
    opts: { fields?: Partial<Record<LoadoutField, string>>; silent?: boolean } = {},
  ) => {
    if (busy.current) return;
    busy.current = true;
    try {
      const from = form.getValues('load_type') as LoadType;
      const fields = opts.fields ?? {};
      if (from === to && !Object.keys(fields).length) return;

      const before = snapshot();
      const carry = planLoadTypeCarry(from, to, {
        linehaul_rate: form.getValues('linehaul_rate'),
        loadout_relocation_fee: form.getValues('loadout_relocation_fee'),
      });

      form.setValue('load_type', to as never, { shouldDirty: true });

      let title: string | null = null;
      let message: string | null = null;
      if (carry.toField && carry.conflicts) {
        title = `${LOAD_TYPE_LABELS[to]} keeps its existing amount`;
        message = `$${carry.amount} was entered as the ${LOAD_TYPE_LABELS[from].toLowerCase()} amount and was not carried over, because this load type already has a different amount.`;
      } else if (carry.toField) {
        form.setValue(carry.toField as never, carry.amount as never, { shouldDirty: true });
        form.setValue(carry.fromField as never, '' as never, { shouldDirty: true });
        message = `Carried $${carry.amount} over as the ${to === 'loadout' ? 'relocation fee' : 'linehaul rate'}.`;
      } else if (to === 'per_ton' && str(form.getValues('linehaul_rate')).trim()) {
        // Per-Ton Bulk shares the amount field with Standard, so nothing is
        // lost — but it forces a per-ton rate structure, which hides the flat
        // amount and drops the running total to $0. Silence there reads exactly
        // like a discarded rate, which is how this was reported.
        title = 'Per-Ton Bulk bills by tonnage';
        message = `The $${str(form.getValues('linehaul_rate'))} flat amount is kept and shown in the rate section, but the load total stays $0 until Rate Per Ton and Estimated Tons are entered.`;
      }

      // Caller-supplied fields belong to the same change, so one undo reverses
      // the whole thing rather than leaving loadout details behind.
      Object.entries(fields).forEach(([name, value]) => {
        if (value === undefined) return;
        form.setValue(name as never, value as never, { shouldDirty: true });
      });

      // A loadout with no stated use window is the normal case, not an error:
      // Rolling River prints none. The pickup and delivery dates are the best
      // available reading, so fill the window from them and record that it was
      // inferred. A window that came from the document, or from a human, is
      // never overwritten.
      if (to === 'loadout') {
        const haveWindow = str(form.getValues('loadout_use_start')).trim()
          || str(form.getValues('loadout_use_end')).trim();
        if (!haveWindow) {
          const derived = deriveUseWindowFromStops(
            (form.getValues('stops') ?? []) as { appointment_start?: string | null; appointment_end?: string | null }[],
          );
          if (derived) {
            form.setValue('loadout_use_start' as never, derived.start as never, { shouldDirty: true });
            form.setValue('loadout_use_end' as never, derived.end as never, { shouldDirty: true });
            form.setValue('loadout_use_window_source' as never, 'derived' as never, { shouldDirty: true });
            if (!message) {
              message = `No trailer use window is printed on the document, so ${derived.start} through ${derived.end} was taken from the pickup and delivery dates. Confirm it with the broker.`;
            }
          }
        } else if (!str(form.getValues('loadout_use_window_source')).trim()) {
          form.setValue('loadout_use_window_source' as never, 'document' as never, { shouldDirty: true });
        }
      }

      const change: LoadTypeChange = { from, to, before, after: snapshot() };
      setLastChange(change);
      setUndone(null);
      if (message && !opts.silent) toast(title ? { title, description: message } : { description: message });
    } finally {
      busy.current = false;
    }
  }, [form, snapshot]);

  /** Puts the form back exactly as it stood before the last change. */
  const undoLastChange = useCallback(() => {
    if (!lastChange) return;
    restore(lastChange.before);
    setUndone(lastChange);
    setLastChange(null);
    toast({
      description: `Reverted to ${LOAD_TYPE_LABELS[lastChange.from]}. Everything that change filled was restored.`,
    });
  }, [lastChange, restore]);

  /** Re-applies an undone change, values and all — no re-parse required. */
  const redoLastChange = useCallback(() => {
    if (!undone) return;
    restore(undone.after);
    setLastChange(undone);
    setUndone(null);
    toast({ description: `Switched back to ${LOAD_TYPE_LABELS[undone.to]}.` });
  }, [undone, restore]);

  return {
    changeLoadType,
    undoLastChange,
    redoLastChange,
    lastChange,
    canUndo: !!lastChange,
    canRedo: !!undone,
  };
}
