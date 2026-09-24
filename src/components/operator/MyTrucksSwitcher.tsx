import { Truck, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OwnedTruck } from '@/hooks/useOwnedTrucks';

interface Props {
  trucks: OwnedTruck[];
  /** Null = his own truck (owner-drivers only). */
  selected: string | null;
  hasOwnTruck: boolean;
  onSelect: (operatorId: string | null) => void;
}

/**
 * "My trucks". Switching changes whose truck fills the screens — never whose
 * login it is.
 */
export default function MyTrucksSwitcher({ trucks, selected, hasOwnTruck, onSelect }: Props) {
  const label = (t: OwnedTruck) => (t.unitNumber ? `Unit ${t.unitNumber} · ${t.driverName}` : t.driverName);
  return (
    <div className="rounded-xl border border-border bg-card p-3" aria-label="My trucks">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">My trucks</p>
      <div className="flex flex-wrap gap-2">
        {hasOwnTruck && (
          <button
            type="button"
            onClick={() => onSelect(null)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm',
              selected === null ? 'border-primary bg-primary/10 text-foreground font-medium' : 'border-border text-muted-foreground',
            )}
          >
            <User className="h-3.5 w-3.5" /> My own truck
          </button>
        )}
        {trucks.map(t => (
          <button
            key={t.operatorId}
            type="button"
            onClick={() => onSelect(t.operatorId)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm',
              selected === t.operatorId ? 'border-primary bg-primary/10 text-foreground font-medium' : 'border-border text-muted-foreground',
            )}
          >
            <Truck className="h-3.5 w-3.5" /> {label(t)}
          </button>
        ))}
      </div>
      {!hasOwnTruck && selected === null && (
        <p className="mt-3 text-sm text-muted-foreground">Choose a truck to see its driver's loads, documents, binder and ICA.</p>
      )}
    </div>
  );
}
