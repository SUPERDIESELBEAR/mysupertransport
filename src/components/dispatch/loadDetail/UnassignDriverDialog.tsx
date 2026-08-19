import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { getDbErrorMessage, logDbError } from '@/lib/dbError';
import { unassignLoadDriver } from '@/lib/loadDetail';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loadId: string;
  driverName: string | null;
}

export default function UnassignDriverDialog({ open, onOpenChange, loadId, driverName }: Props) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!open) setReason(''); }, [open]);

  const handleConfirm = async () => {
    setSaving(true);
    try {
      const res = await unassignLoadDriver(loadId, reason);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['load-detail', loadId] }),
        queryClient.invalidateQueries({ queryKey: ['load-status-history', loadId] }),
        queryClient.invalidateQueries({ queryKey: ['dispatch-loads'] }),
      ]);
      const warning = res?.warnings?.[0]?.message;
      toast({
        title: `${driverName ?? 'Driver'} unassigned`,
        description: res?.status_reverted
          ? 'The load was returned to Available.'
          : warning ?? undefined,
      });
      onOpenChange(false);
    } catch (err) {
      logDbError('unassign_load_driver', err, { loadId });
      toast({
        title: 'Driver not unassigned',
        description: getDbErrorMessage(err, 'Could not unassign the driver.'),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Unassign Driver</DialogTitle>
          <DialogDescription>
            {driverName ? `${driverName} will be removed from this load.` : 'The driver will be removed from this load.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="unassign-reason">Reason</Label>
          <Textarea
            id="unassign-reason"
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Why is this driver being unassigned?"
            rows={3}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={saving || !reason.trim()}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Unassign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}