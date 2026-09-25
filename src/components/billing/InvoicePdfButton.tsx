import { useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { createInvoicePdf, openInvoicePdf } from '@/lib/invoicePdf';

interface Props {
  invoiceId: string;
  /** The stored file path, or null when no PDF exists yet. */
  storagePath: string | null;
  onCreated?: () => void;
}

/** "Invoice PDF" opens the stored file; "Create PDF" asks the function to make one. */
export default function InvoicePdfButton({ invoiceId, storagePath, onCreated }: Props) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      if (storagePath) await openInvoicePdf(storagePath);
      else {
        await createInvoicePdf(invoiceId);
        toast({ title: 'Invoice PDF created' });
        onCreated?.();
      }
    } catch (e) {
      toast({
        title: storagePath ? 'Invoice PDF not opened' : 'Invoice PDF not created',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button size="sm" variant="outline" onClick={run} disabled={busy} className="gap-1.5">
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
      {storagePath ? 'Invoice PDF' : 'Create PDF'}
    </Button>
  );
}
