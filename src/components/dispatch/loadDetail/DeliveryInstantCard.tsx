import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DetailSection } from './DetailPrimitives';
import StopTimePicker from './StopTimePicker';
import { useToast } from '@/hooks/use-toast';
import { getDbErrorMessage, logDbError } from '@/lib/dbError';
import { carrierZoneAbbrev } from '@/lib/carrierTimezone';
import { formatDateTime, type LoadDetail } from '@/lib/loadDetail';
import {
  describeDeliveredAtSource,
  fromDeliveredAtInput,
  isDeliveryInstantMissing,
  MISSING_DELIVERY_INSTANT_EXPLANATION,
  MISSING_DELIVERY_INSTANT_LABEL,
  saveDeliveredAt,
  toDeliveredAtInput,
} from '@/lib/deliveryInstant';

interface DeliveryInstantCardProps {
  load: LoadDetail;
  canEdit: boolean;
  onSaved?: () => void;
}

/**
 * The delivery instant, and its provenance.
 *
 * Normally derived by the database from the driver's departure on the final
 * delivery stop; this card only ever sends the instant itself. When a load is
 * past delivery with no instant it says so plainly — the settlement week
 * cannot be worked out without it, and nothing else in the app would show it.
 */
export default function DeliveryInstantCard({ load, canEdit, onSaved }: DeliveryInstantCardProps) {
  const { toast } = useToast();
  const [value, setValue] = useState(() => toDeliveredAtInput(load.delivered_at));
  const [entering, setEntering] = useState(false);
  const [saving, setSaving] = useState(false);

  const missing = isDeliveryInstantMissing(load);
  const provenance = describeDeliveredAtSource(load.delivered_at_source, null);

  const handleSave = async () => {
    const iso = fromDeliveredAtInput(value);
    if (!iso) {
      toast({ title: 'Enter a delivery date and time', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await saveDeliveredAt(load.id, iso);
      toast({ title: 'Delivery time recorded' });
      setEntering(false);
      onSaved?.();
    } catch (err) {
      logDbError('[DeliveryInstantCard] save failed', err, { loadId: load.id });
      toast({
        title: 'Could not record the delivery time',
        description: getDbErrorMessage(err, 'The update was rejected.'),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <DetailSection title="Delivery instant">
      {load.delivered_at ? (
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">
            {formatDateTime(load.delivered_at)}
            <span className="ml-1 text-[11px] text-muted-foreground">
              {carrierZoneAbbrev(load.delivered_at)}
            </span>
          </p>
          {provenance ? <p className="text-[11px] text-muted-foreground">{provenance}</p> : null}
        </div>
      ) : (
        <div
          className={
            missing
              ? 'flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3'
              : 'text-sm text-muted-foreground'
          }
        >
          {missing ? (
            <>
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  {MISSING_DELIVERY_INSTANT_LABEL}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {MISSING_DELIVERY_INSTANT_EXPLANATION}
                </p>
              </div>
            </>
          ) : (
            <span>
              Not delivered yet. The instant is recorded automatically when the driver&rsquo;s
              departure is entered on the final delivery stop.
            </span>
          )}
        </div>
      )}

      {canEdit ? (
        entering ? (
          <div className="mt-3 space-y-2 rounded-md border border-border bg-muted/40 p-3">
            <StopTimePicker
              id={`delivered-at-${load.id}`}
              label="Delivery date and time"
              value={value}
              onCommit={setValue}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save delivery time'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEntering(false);
                  setValue(toDeliveredAtInput(load.delivered_at));
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="outline" className="mt-3" onClick={() => setEntering(true)}>
            {load.delivered_at ? 'Correct delivery time' : 'Enter delivery time'}
          </Button>
        )
      ) : null}
    </DetailSection>
  );
}
