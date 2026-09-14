/**
 * THE UNIT NUMBER POOL, READ-ONLY.
 *
 * Vehicle Hub answers "what unit is that?"; this panel answers "which number
 * may I hand out next?". Assignment still happens in the onboarding pipeline —
 * nothing here writes, so there is no audit surface and no collision risk.
 *
 * Grouping, ordering and holder wording all come from src/lib/unitNumberPool.ts
 * so the panel and the picker can never disagree.
 */
import { useEffect, useMemo, useState } from 'react';
import { Search, Hash, Loader2, Copy, Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import {
  fetchUnitNumberPool,
  fetchUnitHolders,
  formatPoolOption,
  holderWarning,
  isPoolMissing,
  KIND_GROUP_LABEL,
  POOL_UNAVAILABLE_MESSAGE,
  type UnitPoolEntry,
  type UnitPoolKind,
  type UnitHolder,
} from '@/lib/unitNumberPool';

const GROUP_ORDER: UnitPoolKind[] = ['recycled', 'gap', 'next'];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function UnitNumberPoolPanel({ open, onOpenChange }: Props) {
  const isMobile = useIsMobile();
  const [pool, setPool] = useState<UnitPoolEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [lookup, setLookup] = useState('');
  const debouncedLookup = useDebouncedValue(lookup, 350);
  const [holders, setHolders] = useState<UnitHolder[] | null>(null);
  const [holderLoading, setHolderLoading] = useState(false);
  const [copiedUnit, setCopiedUnit] = useState<number | null>(null);
  const [focusedUnit, setFocusedUnit] = useState<number | null>(null);
  const [focusSource, setFocusSource] = useState<'default' | 'pool' | 'lookup'>('default');

  const copyNumber = (unit: number) => {
    navigator.clipboard?.writeText(String(unit)).then(() => {
      setCopiedUnit(unit);
      setTimeout(() => setCopiedUnit(prev => (prev === unit ? null : prev)), 1500);
    }).catch(() => {});
  };

  useEffect(() => {
    if (!open) {
      setLookup('');
      setHolders(null);
      setFocusedUnit(null);
      setFocusSource('default');
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchUnitNumberPool()
      .then(rows => { if (!cancelled) setPool(rows); })
      .catch(err => {
        if (cancelled) return;
        // Until this draft is accepted the pool function does not exist yet —
        // say that plainly instead of showing a schema-cache error.
        setError(isPoolMissing(err)
          ? POOL_UNAVAILABLE_MESSAGE
          : String(err?.message ?? '') || 'Could not load the unit number pool.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    const q = debouncedLookup.trim();
    if (!open || !q) {
      setHolders(null);
      if (open && focusSource === 'lookup') {
        setFocusedUnit(null);
        setFocusSource('default');
      }
      return;
    }
    let cancelled = false;
    setHolderLoading(true);
    fetchUnitHolders(q)
      .then(rows => {
        if (cancelled) return;
        setHolders(rows);
        const unit = Number(q);
        if (Number.isFinite(unit)) {
          setFocusedUnit(unit);
          setFocusSource('lookup');
        }
      })
      .catch(() => { if (!cancelled) setHolders(null); })
      .finally(() => { if (!cancelled) setHolderLoading(false); });
    return () => { cancelled = true; };
  }, [debouncedLookup, open, focusSource]);

  const groups = useMemo(
    () => GROUP_ORDER.map(kind => ({ kind, entries: pool.filter(e => e.kind === kind) })).filter(g => g.entries.length > 0),
    [pool],
  );
  const nextEntry = pool.find(e => e.kind === 'next');
  const freeCount = pool.filter(e => e.kind !== 'next').length;
  const focusedEntry = focusedUnit === null ? nextEntry : pool.find(e => e.unit === focusedUnit);
  const displayedUnit = focusedUnit ?? nextEntry?.unit ?? null;
  const showingDefault = focusSource === 'default';

  const warning = holders && holders.length > 0 ? holderWarning(debouncedLookup.trim(), holders) : null;
  const freeTyped = holders !== null && holders.length === 0 && debouncedLookup.trim() !== '';
  const focusLabel = showingDefault
    ? 'Next available'
    : focusSource === 'lookup'
      ? 'Lookup result'
      : focusedEntry
        ? `Selected · ${KIND_GROUP_LABEL[focusedEntry.kind]}`
        : 'Selected unit';
  const focusDetail = focusSource === 'lookup'
    ? warning ?? (freeTyped ? 'Not held by anyone' : 'Checking availability…')
    : focusedEntry
      ? formatPoolOption(focusedEntry)
      : '';

  const focusPoolNumber = (unit: number) => {
    setFocusedUnit(unit);
    setFocusSource('pool');
    copyNumber(unit);
  };

  // The top section (search, lookup result, next-number strip) stays fixed;
  // only the group lists scroll, so the answer is always on screen.
  const topSection = (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Look up a number…"
          className="pl-9 h-9 text-sm"
          value={lookup}
          onChange={e => setLookup(e.target.value)}
          inputMode="numeric"
        />
      </div>

      {holderLoading && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin" /> Checking…
        </p>
      )}
      {!holderLoading && warning && (
        <p className="text-xs rounded-md border border-amber-300 bg-amber-50 text-amber-900 px-3 py-2">{warning}</p>
      )}
      {!holderLoading && freeTyped && (
        <p className="text-xs rounded-md border border-emerald-300 bg-emerald-50 text-emerald-900 px-3 py-2">
          Unit {debouncedLookup.trim()} is not held by anyone.
        </p>
      )}

      {!loading && !error && displayedUnit !== null && (
        <div className="flex items-center justify-between rounded-lg border border-primary/40 bg-primary/5 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-primary">{focusLabel}</p>
            <p className="text-lg font-semibold leading-tight">
              {displayedUnit}
            </p>
            {focusDetail && <p className="mt-0.5 max-w-sm text-xs text-muted-foreground">{focusDetail}</p>}
            {showingDefault ? (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {freeCount} number{freeCount === 1 ? '' : 's'} free
              </p>
            ) : nextEntry && displayedUnit !== nextEntry.unit ? (
              <p className="mt-1 text-xs text-muted-foreground">Next available: {nextEntry.unit}</p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => copyNumber(displayedUnit)}
          >
            {copiedUnit === displayedUnit ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copiedUnit === displayedUnit ? 'Copied' : 'Copy'}
          </Button>
        </div>
      )}
    </div>
  );

  const listSection = (
    <div className="space-y-4">
      {loading && (
        <div className="space-y-3" aria-label="Loading the pool">
          <Skeleton className="h-4 w-28" />
          <div className="flex flex-wrap gap-1.5">
            <Skeleton className="h-6 w-16" /><Skeleton className="h-6 w-16" /><Skeleton className="h-6 w-16" />
          </div>
          <Skeleton className="h-4 w-36" />
          <div className="flex flex-wrap gap-1.5">
            <Skeleton className="h-6 w-12" /><Skeleton className="h-6 w-12" />
          </div>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {!loading && !error && groups.map(group => (
        <div key={group.kind} className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {KIND_GROUP_LABEL[group.kind]}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {group.entries.map(entry => (
              <Badge
                key={`${entry.kind}-${entry.unit}`}
                variant="outline"
                className={`cursor-pointer text-xs font-normal gap-1 hover:bg-accent ${displayedUnit === entry.unit ? 'border-primary bg-primary/10 text-primary' : ''}`}
                title={`${entry.note} · ${formatPoolOption(entry)}`}
                onClick={() => focusPoolNumber(entry.unit)}
              >
                {entry.unit}
                {entry.kind === 'recycled' && (
                  <span className="text-[10px] text-muted-foreground">{formatPoolOption(entry)}</span>
                )}
                {copiedUnit === entry.unit
                  ? <Check className="h-3 w-3 text-emerald-600" />
                  : <Copy className="h-3 w-3 text-muted-foreground" />}
              </Badge>
            ))}
          </div>
        </div>
      ))}

      {!loading && !error && groups.length === 0 && (
        <p className="text-sm text-muted-foreground">No numbers are free right now.</p>
      )}
      {!loading && !error && groups.length > 0 && !groups.some(g => g.kind === 'recycled') && nextEntry && (
        <p className="text-xs text-muted-foreground">
          No recycled numbers — next available is {nextEntry.unit}.
        </p>
      )}
    </div>
  );

  const body = (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {topSection}
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">{listSection}</div>
    </div>
  );

  const summary = loading || error
    ? 'Numbers freed before Go-Live, gaps in the sequence, and the next number available.'
    : `${freeCount} number${freeCount === 1 ? '' : 's'} free${nextEntry ? ` · next in sequence ${nextEntry.unit}` : ''}`;

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[90dvh] flex flex-col overflow-hidden">
          <SheetHeader className="text-left">
            <SheetTitle className="flex items-center gap-2"><Hash className="h-4 w-4" /> Unit Numbers</SheetTitle>
            <SheetDescription>{summary}</SheetDescription>
          </SheetHeader>
          <div className="mt-4 flex min-h-0 flex-1 flex-col">{body}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Hash className="h-4 w-4" /> Unit Numbers</DialogTitle>
          <DialogDescription>{summary}</DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}
