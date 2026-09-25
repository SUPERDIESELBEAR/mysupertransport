import { useState } from 'react';
import { Files, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { previewInvoicePacket } from '@/lib/invoicePdf';

export default function PacketPreviewButton({ loadId }: { loadId: string }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const open = async () => {
    setBusy(true);
    try { await previewInvoicePacket(loadId); }
    catch (e) {
      toast({ title: 'Packet not opened', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally { setBusy(false); }
  };
  return (
    <Button size="sm" variant="outline" onClick={open} disabled={busy} className="gap-1.5">
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Files className="h-4 w-4" />}
      Preview packet
    </Button>
  );
}