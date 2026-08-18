import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MapPin } from 'lucide-react';

export interface TownOption { city: string; state: string }

export function townKey(t: TownOption) {
  return `${t.city.trim().toLowerCase()}|${t.state.trim().toUpperCase()}`;
}

export function formatTown(t: TownOption) {
  return t.state ? `${t.city}, ${t.state}` : t.city;
}

/**
 * The typed path, and it stands on its own.
 *
 * A driver's day is four or five towns, so the towns he has already used today
 * are one tap. Free text with a two-letter state is always available beneath
 * them. Nothing here needs a signal — offline is the normal case for a log kept
 * because the ELD died. A geocoder, when one is switched on, only ever
 * pre-selects a chip; the stored value is the text the driver accepted.
 */
export default function LocationPicker({
  city, state, onChange, today, recent, disabled,
}: {
  city: string;
  state: string;
  onChange: (next: TownOption) => void;
  /** Towns already used on this day's log. */
  today: TownOption[];
  /** Towns from the last few days. */
  recent?: TownOption[];
  disabled?: boolean;
}) {
  const [showAll, setShowAll] = useState(false);

  const chips = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<TownOption & { fromToday: boolean }> = [];
    for (const t of today) {
      if (!t.city.trim() || seen.has(townKey(t))) continue;
      seen.add(townKey(t));
      out.push({ ...t, fromToday: true });
    }
    if (showAll || out.length === 0) {
      for (const t of recent ?? []) {
        if (!t.city.trim() || seen.has(townKey(t))) continue;
        seen.add(townKey(t));
        out.push({ ...t, fromToday: false });
      }
    }
    return out.slice(0, 12);
  }, [today, recent, showAll]);

  const selectedKey = townKey({ city, state });

  return (
    <div className="space-y-3">
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {chips.map((t) => {
            const active = townKey(t) === selectedKey;
            return (
              <button
                key={townKey(t)}
                type="button"
                disabled={disabled}
                onClick={() => onChange({ city: t.city, state: t.state })}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-sm transition ${
                  active
                    ? 'border-primary bg-primary/10 font-semibold text-foreground'
                    : 'border-border text-muted-foreground'
                }`}
              >
                <MapPin className="h-3.5 w-3.5" />
                {formatTown(t)}
              </button>
            );
          })}
          {!showAll && (recent?.length ?? 0) > 0 && (
            <button
              type="button"
              className="rounded-full border border-dashed border-border px-3 py-2 text-sm text-muted-foreground"
              onClick={() => setShowAll(true)}
            >
              Recent towns
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-[1fr_84px] gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Town</Label>
          <Input
            className="text-base" disabled={disabled} value={city} placeholder="Pleasant Hill"
            onChange={(e) => onChange({ city: e.target.value, state })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">State</Label>
          <Input
            className="text-base uppercase" maxLength={2} disabled={disabled} value={state} placeholder="MO"
            onChange={(e) => onChange({ city, state: e.target.value.toUpperCase() })}
          />
        </div>
      </div>
    </div>
  );
}
