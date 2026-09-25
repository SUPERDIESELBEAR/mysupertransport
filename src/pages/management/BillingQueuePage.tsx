/**
 * BILLING QUEUE — Management and owner only. Module 7, Pass 3.
 *
 * Loads at `ready_to_invoice`, oldest first, each with WHAT IT WOULD INVOICE
 * FOR and WHY — the itemised parts from the Pass 2 pure builder, so the figure
 * can be seen before it is committed to. Creating the invoice hands those same
 * parts to `public.create_invoice`, which refuses anything that does not
 * follow, allocates the number ON THE WRITE, and advances the load to
 * `invoiced` through the existing status path.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { ChevronDown, ChevronRight, FileText, Loader2 } from 'lucide-react';
import {
  gatherBillingQueue, storeInvoice, type QueuedLoad,
} from '@/lib/billingRun';
import InvoicePdfButton from '@/components/billing/InvoicePdfButton';
import PacketPreviewButton from '@/components/billing/PacketPreviewButton';
import { createInvoicePdf, fetchInvoiceFiles } from '@/lib/invoicePdf';

interface RecentInvoice { id: string; invoice_number: string; amount: number; loadNumber: string; storagePath: string | null }

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

const day = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-US', {
        timeZone: 'America/Chicago', dateStyle: 'medium',
      })
    : '—';

const FACTORING_LABEL: Record<string, string> = {
  approved: 'Factoring approved',
  not_approved: 'Not approved for factoring',
  unknown: 'Factoring status unknown',
  pending: 'Factoring approval pending',
};

export default function BillingQueuePage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<QueuedLoad[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [confirming, setConfirming] = useState<QueuedLoad | null>(null);
  const [saving, setSaving] = useState(false);
  const [recent, setRecent] = useState<RecentInvoice[]>([]);

  const loadRecent = useCallback(async () => {
    try {
      const { data, error: e } = await supabase
        .from('invoices')
        .select('id, invoice_number, amount, created_at, loads(load_number)')
        .order('created_at', { ascending: false })
        .limit(10);
      if (e) throw e;
      const rowsIn = (data ?? []) as Array<{ id: string; invoice_number: string; amount: number; loads: { load_number: string } | null }>;
      const files = await fetchInvoiceFiles(rowsIn.map((r) => r.id));
      setRecent(rowsIn.map((r) => ({
        id: r.id, invoice_number: r.invoice_number, amount: Number(r.amount),
        loadNumber: r.loads?.load_number ?? '—', storagePath: files[r.id] ?? null,
      })));
    } catch { setRecent([]); }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await gatherBillingQueue(supabase));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); void loadRecent(); }, [load, loadRecent]);

  const total = useMemo(
    () => rows.reduce((s, r) => s + r.invoice.amount, 0),
    [rows],
  );

  const create = async () => {
    if (!confirming) return;
    setSaving(true);
    try {
      const stored = await storeInvoice(supabase, confirming);
      toast({
        title: `Invoice ${stored.invoiceNumber} created`,
        description: `${stored.loadNumber} — ${money(stored.amount)}, billing `
          + `${stored.billingPath === 'factored' ? 'through the factor' : 'direct to the broker'}.`,
      });
      setConfirming(null);
      // The PDF is made straight after the invoice. A failure here leaves the
      // invoice intact and shows "Create PDF" in Recent invoices.
      try {
        await createInvoicePdf(stored.invoiceId);
      } catch (pe) {
        toast({
          title: 'Invoice PDF not created',
          description: pe instanceof Error ? pe.message : String(pe),
          variant: 'destructive',
        });
      }
      await Promise.all([load(), loadRecent()]);
    } catch (e) {
      toast({
        title: 'Invoice not created',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <FileText className="h-5 w-5" /> Billing Queue
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Loads ready to invoice, oldest first. Each figure is the header rate plus any
            unbundled fuel surcharge plus every charge on the load, at full amount.
          </p>
        </div>
        {!loading && rows.length > 0 && (
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Queued total</div>
            <div className="text-xl font-semibold">{money(total)}</div>
          </div>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Reading the queue…
        </div>
      )}

      {error && (
        <Card className="p-4 border-destructive/40 text-destructive text-sm">{error}</Card>
      )}

      {!loading && !error && rows.length === 0 && (
        <Card className="p-8 text-center text-muted-foreground">
          Nothing is ready to invoice right now.
        </Card>
      )}

      <div className="space-y-3">
        {rows.map((r) => {
          const isOpen = !!open[r.loadId];
          return (
            <Card key={r.loadId} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  className="flex items-center gap-2 text-left"
                  onClick={() => setOpen((o) => ({ ...o, [r.loadId]: !isOpen }))}
                >
                  {isOpen
                    ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  <span className="font-medium">{r.loadNumber}</span>
                  <span className="text-sm text-muted-foreground">
                    {r.brokerName ?? 'No broker'} · delivered {day(r.deliveredAt)}
                  </span>
                </button>

                <div className="flex items-center gap-3">
                  <Badge
                    variant="outline"
                    className={r.billingPath === 'factored'
                      ? 'border-status-complete/40 text-status-complete'
                      : 'border-muted-foreground/30 text-muted-foreground'}
                  >
                    {r.billingPath === 'factored' ? 'Factored' : 'Direct'}
                  </Badge>
                  <span className="text-lg font-semibold">{money(r.invoice.amount)}</span>
                  <PacketPreviewButton loadId={r.loadId} />
                  <Button size="sm" onClick={() => setConfirming(r)} disabled={r.missing.length > 0}>Create invoice</Button>
                </div>
              </div>

              {isOpen && (
                <div className="mt-4 border-t pt-3 space-y-1 text-sm">
                  {r.invoice.lines.map((l, i) => (
                    <div key={`${l.loadChargeId ?? l.lineType}-${i}`} className="flex justify-between">
                      <span className="text-muted-foreground">{l.description}</span>
                      <span className="tabular-nums">{money(l.amount)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between border-t pt-2 font-medium">
                    <span>Invoice total</span>
                    <span className="tabular-nums">{money(r.invoice.amount)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground pt-2">
                    {FACTORING_LABEL[r.factoringStatus ?? ''] ?? 'No broker on this load'} —
                    {' '}bills {r.billingPath === 'factored' ? 'through the factor' : 'direct to the broker'}.
                  </p>
                  {r.missing.length > 0 && (
                    <div className="pt-2 text-sm text-destructive">
                      <p className="font-medium">Missing before invoicing:</p>
                      <ul className="list-disc pl-5">{r.missing.map(item => <li key={item}>{item}</li>)}</ul>
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {recent.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Recent invoices</h2>
          {recent.map((r) => (
            <Card key={r.id} className="p-3 flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm">
                <span className="font-medium">{r.invoice_number}</span>
                <span className="text-muted-foreground"> · {r.loadNumber} · {money(r.amount)}</span>
              </span>
              <InvoicePdfButton invoiceId={r.id} storagePath={r.storagePath} onCreated={loadRecent} />
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!confirming} onOpenChange={(o) => { if (!o && !saving) setConfirming(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create invoice for {confirming?.loadNumber}</DialogTitle>
            <DialogDescription>
              An invoice number is assigned when the invoice is saved, and the load moves to
              Invoiced. This cannot be undone from here.
            </DialogDescription>
          </DialogHeader>

          {confirming && (
            <div className="space-y-1 text-sm">
              {confirming.invoice.lines.map((l, i) => (
                <div key={i} className="flex justify-between">
                  <span className="text-muted-foreground">{l.description}</span>
                  <span className="tabular-nums">{money(l.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t pt-2 font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{money(confirming.invoice.amount)}</span>
              </div>
              <p className="text-xs text-muted-foreground pt-2">
                Billing {confirming.billingPath === 'factored' ? 'through the factor' : 'direct to the broker'}
                {' '}— {FACTORING_LABEL[confirming.factoringStatus ?? ''] ?? 'no broker on this load'}.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={create} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
