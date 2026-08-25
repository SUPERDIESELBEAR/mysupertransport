import { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { getDbErrorMessage } from '@/lib/dbError';
import { logDoNotLoadOverride } from '@/lib/brokerRelationship';

interface Props {
  broker: { id: string; company_name: string; do_not_load_reason: string | null };
}

/**
 * Warns — never blocks. Rendered from the in-memory broker record at selection
 * time, so the load save path, its RPCs, and the parser/revision code are all
 * untouched. Proceeding is audit-logged the same way a duplicate override is.
 */
export default function BrokerDoNotLoadWarning({ broker }: Props) {
  const { toast } = useToast();
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  const acknowledge = async () => {
    setSaving(true);
    try {
      await logDoNotLoadOverride(broker, reason.trim());
      setAcknowledged(true);
      toast({ description: 'Override recorded. You can continue building this load.' });
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Override not recorded',
        description: getDbErrorMessage(e, 'Could not record the override.'),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      data-testid="broker-do-not-load-warning"
      className="mt-1.5 rounded-md border border-destructive/40 bg-destructive/8 p-3 space-y-2"
    >
      <p className="flex items-start gap-2 text-sm font-semibold text-foreground">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
        {broker.company_name} is flagged do-not-load
      </p>
      <p className="text-xs text-muted-foreground">
        {broker.do_not_load_reason
          ? `Reason on file: ${broker.do_not_load_reason}`
          : 'No reason is recorded on the broker.'}
        {' '}This does not stop the load — record why you are proceeding.
      </p>
      {acknowledged ? (
        <p className="text-xs text-muted-foreground">Override recorded for this load.</p>
      ) : (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="broker-dnl-override" className="text-xs">Reason for proceeding</Label>
            <Textarea
              id="broker-dnl-override"
              rows={2}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g., approved by management for this customer only"
            />
          </div>
          <div className="flex justify-end">
            <Button
              type="button" size="sm" variant="outline"
              disabled={!reason.trim() || saving}
              onClick={() => void acknowledge()}
            >
              {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Record override
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
