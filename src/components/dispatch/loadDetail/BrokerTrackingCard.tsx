import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { DetailSection } from './DetailPrimitives';

interface Props {
  loadId: string;
  status: string;
  deliveredAt: string | null;
}

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
export const trackingUrl = (token: string) => `${window.location.origin}/track/${token}`;

/** Staff-only card (dispatcher, management, owner). The caller gates visibility. */
export default function BrokerTrackingCard({ loadId, status, deliveredAt }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const key = ['load-tracking-link', loadId];

  const { data } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data: row, error } = await supabase
        .from('share_tokens')
        .select('token, revoked_at')
        .eq('scope', 'load_tracking')
        .eq('resource_id', loadId)
        .maybeSingle();
      if (error) throw error;
      let delivered = deliveredAt;
      if (!delivered) {
        const { data: h, error: hErr } = await supabase
          .from('load_status_history')
          .select('changed_at')
          .eq('load_id', loadId)
          .eq('new_status', 'delivered')
          .order('changed_at', { ascending: true })
          .limit(1);
        if (hErr) throw hErr;
        delivered = h?.[0]?.changed_at ?? null;
      }
      return { row, delivered };
    },
  });

  const cancelled = status === 'cancelled' || status === 'tonu';
  const expired = !!data?.delivered && Date.now() - new Date(data.delivered).getTime() > SEVEN_DAYS;
  const active = data?.row && !data.row.revoked_at ? data.row.token : null;
  const wasRevoked = !!data?.row?.revoked_at;

  const create = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('get_or_create_load_tracking_link', { p_load_id: loadId });
    setBusy(false);
    if (error) { toast({ title: error.message, variant: 'destructive' }); return; }
    await qc.invalidateQueries({ queryKey: key });
  };
  const revoke = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('revoke_load_tracking_link', { p_load_id: loadId });
    setBusy(false);
    setConfirmOpen(false);
    if (error) { toast({ title: error.message, variant: 'destructive' }); return; }
    await qc.invalidateQueries({ queryKey: key });
  };
  const copy = async () => {
    if (!active) return;
    await navigator.clipboard.writeText(trackingUrl(active));
    toast({ title: 'Link copied' });
  };

  let body: React.ReactNode;
  if (cancelled) {
    body = <p className="text-sm text-muted-foreground">Tracking is off for cancelled loads.</p>;
  } else if (expired) {
    body = <p className="text-sm text-muted-foreground">This tracking link has expired.</p>;
  } else if (!data) {
    body = null;
  } else if (active) {
    body = (
      <div className="space-y-2">
        <p className="break-all rounded border border-border bg-muted px-2 py-1 font-mono text-xs">{trackingUrl(active)}</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={copy}>Copy link</Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirmOpen(true)} disabled={busy}>Stop sharing</Button>
        </div>
      </div>
    );
  } else {
    body = (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Share this link with the broker. It shows status and stop times — no rates.</p>
        <Button size="sm" onClick={create} disabled={busy}>
          {wasRevoked ? 'Create new link' : 'Create tracking link'}
        </Button>
      </div>
    );
  }

  return (
    <DetailSection title="Broker tracking">
      {body}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop sharing?</AlertDialogTitle>
            <AlertDialogDescription>The broker's link will stop working. You can create a new one.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={revoke}>Stop sharing</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DetailSection>
  );
}
