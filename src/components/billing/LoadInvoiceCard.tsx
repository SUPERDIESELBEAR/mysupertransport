import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import InvoicePdfButton from '@/components/billing/InvoicePdfButton';
import { fetchInvoiceFiles } from '@/lib/invoicePdf';
import PacketPreviewButton from '@/components/billing/PacketPreviewButton';
import SendToFactorButton from '@/components/billing/SendToFactorButton';
import InvoiceSendHistory from '@/components/billing/InvoiceSendHistory';
import { fetchDefaultFactorName, fetchInvoiceSends, lastRealSend } from '@/lib/invoiceSend';

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

/** The load's invoice (one per load) with its PDF, send and send history. Renders nothing before invoicing. */
export default function LoadInvoiceCard({ loadId }: { loadId: string }) {
  const qc = useQueryClient();
  const key = ['load-invoice', loadId];
  const { data } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data: inv, error } = await supabase
        .from('invoices').select('id, invoice_number, amount').eq('load_id', loadId).maybeSingle();
      if (error) throw new Error(error.message);
      if (!inv) return null;
      const [files, sends, factorName] = await Promise.all([
        fetchInvoiceFiles([inv.id]), fetchInvoiceSends([inv.id]), fetchDefaultFactorName(),
      ]);
      return { ...inv, storagePath: files[inv.id] ?? null, sends, factorName };
    },
  });
  if (!data) return null;
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs text-muted-foreground">Invoice</div>
          <div className="font-medium">{data.invoice_number} · {money(Number(data.amount))}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <PacketPreviewButton loadId={loadId} />
          <InvoicePdfButton invoiceId={data.id} storagePath={data.storagePath} onCreated={refresh} />
          <SendToFactorButton
            invoiceId={data.id} invoiceNumber={data.invoice_number} loadId={loadId}
            factorName={data.factorName} lastSend={lastRealSend(data.sends)} onSent={refresh}
          />
        </div>
      </div>
      <div>
        <div className="text-xs font-medium text-muted-foreground mb-1">Send history</div>
        <InvoiceSendHistory rows={data.sends} />
      </div>
    </div>
  );
}
