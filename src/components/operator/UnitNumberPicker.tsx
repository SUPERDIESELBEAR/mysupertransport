import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, ChevronsUpDown, Hash, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  KIND_GROUP_LABEL,
  fetchUnitHolders,
  fetchUnitNumberPool,
  formatPoolOption,
  holderWarning,
  isHardCollision,
  type UnitPoolEntry,
  type UnitPoolKind,
} from '@/lib/unitNumberPool';

const GROUPS: UnitPoolKind[] = ['recycled', 'gap', 'next'];

/**
 * Assigning a unit number, from what is actually free.
 *
 * Free text is still allowed — a rehire legitimately reuses his own old number
 * and no list can anticipate that — but a typed number that someone else holds
 * produces a named warning instead of a silent collision.
 */
export default function UnitNumberPicker({
  value,
  onChange,
  size = 'md',
  placeholder = 'Select or type a unit number',
  disabled,
}: {
  value: string | null;
  onChange: (unit: string | null) => void;
  size?: 'sm' | 'md';
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pool, setPool] = useState<UnitPoolEntry[] | null>(null);
  const [poolError, setPoolError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [hardCollision, setHardCollision] = useState(false);
  const [typed, setTyped] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (!open || pool) return;
    fetchUnitNumberPool()
      .then(p => { if (!cancelled) { setPool(p); setPoolError(null); } })
      .catch(e => { if (!cancelled) setPoolError(e?.message ?? 'Could not load available numbers'); });
    return () => { cancelled = true; };
  }, [open, pool]);

  // Who holds the current value, checked whenever it settles.
  useEffect(() => {
    let cancelled = false;
    const unit = String(value ?? '').trim();
    if (!unit) { setWarning(null); setHardCollision(false); return; }
    const t = setTimeout(() => {
      fetchUnitHolders(unit)
        .then(holders => {
          if (cancelled) return;
          setWarning(holderWarning(unit, holders));
          setHardCollision(isHardCollision(holders));
        })
        .catch(() => { if (!cancelled) { setWarning(null); setHardCollision(false); } });
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [value]);

  const grouped = useMemo(() => {
    const out: Record<UnitPoolKind, UnitPoolEntry[]> = { recycled: [], gap: [], next: [] };
    for (const e of pool ?? []) out[e.kind].push(e);
    return out;
  }, [pool]);

  const isSm = size === 'sm';
  const typedTrimmed = typed.trim();
  const typedIsNew = typedTrimmed !== '' && !(pool ?? []).some(e => String(e.unit) === typedTrimmed);

  const commit = (unit: string | null) => {
    onChange(unit && unit.trim() !== '' ? unit.trim() : null);
    setOpen(false);
    setTyped('');
  };

  return (
    <div className="space-y-1.5">
      <Popover open={open} onOpenChange={setOpen} modal>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              'w-full justify-between font-normal',
              isSm ? 'h-8 text-xs px-3' : 'h-9 text-sm',
              !value && 'text-muted-foreground',
            )}
          >
            <span className="flex items-center gap-2 truncate">
              <Hash className={cn('shrink-0 text-muted-foreground', isSm ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
              <span className="truncate font-mono">{value || placeholder}</span>
            </span>
            <ChevronsUpDown className={cn('shrink-0 opacity-50 ml-2', isSm ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-[--radix-popover-trigger-width] min-w-[280px]" align="start">
          <Command shouldFilter>
            <CommandInput
              placeholder="Search or type a number…"
              className="h-9"
              value={typed}
              onValueChange={setTyped}
            />
            <CommandList className="overscroll-contain max-h-[260px]">
              {!pool && !poolError && (
                <div className="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading available numbers…
                </div>
              )}
              {poolError && (
                <div className="px-3 py-3 text-xs text-destructive">{poolError}</div>
              )}
              {pool && <CommandEmpty>No matching number.</CommandEmpty>}
              {typedIsNew && (
                <CommandGroup heading="Use what you typed">
                  <CommandItem value={`use-${typedTrimmed}`} onSelect={() => commit(typedTrimmed)}>
                    <span className="font-mono">{typedTrimmed}</span>
                    <span className="ml-auto text-[11px] text-muted-foreground">typed by hand</span>
                  </CommandItem>
                </CommandGroup>
              )}
              {GROUPS.map(kind => (
                grouped[kind].length > 0 && (
                  <CommandGroup key={kind} heading={KIND_GROUP_LABEL[kind]}>
                    {grouped[kind].map(e => (
                      <CommandItem
                        key={`${kind}-${e.unit}`}
                        value={String(e.unit)}
                        onSelect={() => commit(String(e.unit))}
                        className="flex items-center gap-2"
                      >
                        <Check className={cn('h-4 w-4 shrink-0', String(e.unit) === String(value ?? '') ? 'opacity-100 text-primary' : 'opacity-0')} />
                        <span className="font-mono">{e.unit}</span>
                        <span className="ml-auto text-[11px] text-muted-foreground">{formatPoolOption(e)}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {warning && (
        <div className={cn(
          'flex gap-2 rounded-lg border px-2.5 py-2 text-[11px]',
          hardCollision
            ? 'border-destructive/30 bg-destructive/5 text-destructive'
            : 'border-border bg-muted/40 text-muted-foreground',
        )}>
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{warning}</span>
        </div>
      )}
    </div>
  );
}
