import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import InvoicePdfButton from '@/components/billing/InvoicePdfButton';
import { fetchInvoiceFiles } from '@/lib/invoicePdf';
import PacketPreviewButton from '@/components/billing/PacketPreviewButton';

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

/** The load's invoice (one per load) with its PDF action. Renders nothing before invoicing. */
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
      const files = await fetchInvoiceFiles([inv.id]);
      return { ...inv, storagePath: files[inv.id] ?? null };
    },
  });
  if (!data) return null;
  return (
    <div className="rounded-lg border bg-card p-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <div className="text-xs text-muted-foreground">Invoice</div>
        <div className="font-medium">{data.invoice_number} · {money(Number(data.amount))}</div>
      </div>
      <div className="flex gap-2">
        <PacketPreviewButton loadId={loadId} />
        <InvoicePdfButton
          invoiceId={data.id}
          storagePath={data.storagePath}
          onCreated={() => qc.invalidateQueries({ queryKey: key })}
        />
      </div>
    </div>
  );
}
