import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Truck, X } from 'lucide-react';
import { fetchLoadChatContext, type LoadChatContext } from '@/lib/loadChat';
import { formatEnumLabel } from '@/lib/loadFormat';

interface Props {
  loadId: string;
  /** When provided, shows an X that unlinks the load from the next message. */
  onClear?: () => void;
  /** Open the load record (staff only). */
  onOpenLoad?: (loadId: string) => void;
  /** Staff-facing privacy notice before sending a load-linked message. */
  showStaffVisibilityNotice?: boolean;
}

const apptLabel = (iso: string | null) => (iso ? format(new Date(iso), 'MMM d, h:mm a') : 'No appointment');

/**
 * Shown above the composer while a conversation is focused on a load, so both
 * sides can see which load the next message is about.
 */
export function LoadContextBanner({ loadId, onClear, onOpenLoad, showStaffVisibilityNotice }: Props) {
  const [ctx, setCtx] = useState<LoadChatContext | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchLoadChatContext(loadId).then(c => { if (!cancelled) setCtx(c); });
    return () => { cancelled = true; };
  }, [loadId]);

  if (!ctx) return null;

  return (
    <div className="shrink-0 border-t border-primary/20 bg-primary/5 px-5 py-2">
      <div className="flex items-start gap-2">
        <Truck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {onOpenLoad ? (
              <button
                type="button"
                onClick={() => onOpenLoad(ctx.id)}
                className="font-mono text-xs font-semibold text-primary hover:underline"
              >
                {ctx.load_number}
              </button>
            ) : (
              <span className="font-mono text-xs font-semibold text-primary">{ctx.load_number}</span>
            )}
            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              {formatEnumLabel(ctx.status)}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-foreground/80">
            {ctx.origin ?? 'Origin TBD'} → {ctx.destination ?? 'Destination TBD'}
          </p>
          <p className="text-[10px] text-muted-foreground">
            Pickup {apptLabel(ctx.pickup_at)} · Delivery {apptLabel(ctx.delivery_at)}
          </p>
          {showStaffVisibilityNotice ? (
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              Messages linked to a load are visible to staff on the load record.
            </p>
          ) : null}
        </div>
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted"
            aria-label="Unlink load from this conversation"
            title="Unlink load"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
