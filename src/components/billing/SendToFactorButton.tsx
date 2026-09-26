import { useState } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import SendToFactorDialog from '@/components/billing/SendToFactorDialog';
import { sentDate, type InvoiceSendRow } from '@/lib/invoiceSend';
import { useToast } from '@/hooks/use-toast';

interface Props {
  invoiceId: string;
  invoiceNumber: string;
  loadId: string;
  factorName: string | null;
  lastSend: InvoiceSendRow | null;
  onSent?: () => void;
}

/** "Send to {factor}", or after a send: "Sent {date} to {addresses}" and "Send again". */
export default function SendToFactorButton({ invoiceId, invoiceNumber, loadId, factorName, lastSend, onSent }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  if (!factorName) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {lastSend && (
        <span className="text-xs text-muted-foreground">
          Sent {sentDate(lastSend.sent_at)} to {[...lastSend.to_emails, ...lastSend.cc_emails].join(', ')}
        </span>
      )}
      <Button size="sm" variant={lastSend ? 'outline' : 'default'} className="gap-1.5" onClick={() => setOpen(true)}>
        <Send className="h-4 w-4" />
        {lastSend ? 'Send again' : `Send to ${factorName}`}
      </Button>
      <SendToFactorDialog
        open={open}
        onOpenChange={setOpen}
        invoiceId={invoiceId}
        invoiceNumber={invoiceNumber}
        loadId={loadId}
        factorName={factorName}
        onSent={r => {
          toast({ title: `${invoiceNumber} sent`, description: `To ${[...r.to, ...r.cc].join(', ')}` });
          onSent?.();
        }}
      />
    </div>
  );
}
