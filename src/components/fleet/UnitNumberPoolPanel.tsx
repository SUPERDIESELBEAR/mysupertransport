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

  useEffect(() => {
    if (!open) return;
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
    if (!open || !q) { setHolders(null); return; }
    let cancelled = false;
    setHolderLoading(true);
    fetchUnitHolders(q)
      .then(rows => { if (!cancelled) setHolders(rows); })
      .catch(() => { if (!cancelled) setHolders(null); })
      .finally(() => { if (!cancelled) setHolderLoading(false); });
    return () => { cancelled = true; };
  }, [debouncedLookup, open]);

  const groups = useMemo(
    () => GROUP_ORDER.map(kind => ({ kind, entries: pool.filter(e => e.kind === kind) })).filter(g => g.entries.length > 0),
    [pool],
  );
  const nextEntry = pool.find(e => e.kind === 'next');
  const freeCount = pool.filter(e => e.kind !== 'next').length;

  const warning = holders && holders.length > 0 ? holderWarning(debouncedLookup.trim(), holders) : null;
  const freeTyped = holders !== null && holders.length === 0 && debouncedLookup.trim() !== '';

  const body = (
    <div className="space-y-4">
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

      {loading && (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading the pool…
        </p>
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
                className={`text-xs font-normal ${entry.kind === 'next' ? 'border-primary text-primary' : ''}`}
                title={`${entry.note} · ${formatPoolOption(entry)}`}
              >
                {entry.unit}
                {entry.kind === 'recycled' && (
                  <span className="ml-1.5 text-[10px] text-muted-foreground">{formatPoolOption(entry)}</span>
                )}
              </Badge>
            ))}
          </div>
        </div>
      ))}

      {!loading && !error && groups.length === 0 && (
        <p className="text-sm text-muted-foreground">No numbers are free right now.</p>
      )}
    </div>
  );

  const summary = loading || error
    ? 'Numbers freed before Go-Live, gaps in the sequence, and the next number available.'
    : `${freeCount} number${freeCount === 1 ? '' : 's'} free${nextEntry ? ` · next in sequence ${nextEntry.unit}` : ''}`;

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto">
          <SheetHeader className="text-left">
            <SheetTitle className="flex items-center gap-2"><Hash className="h-4 w-4" /> Unit Numbers</SheetTitle>
            <SheetDescription>{summary}</SheetDescription>
          </SheetHeader>
          <div className="mt-4">{body}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Hash className="h-4 w-4" /> Unit Numbers</DialogTitle>
          <DialogDescription>{summary}</DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}
