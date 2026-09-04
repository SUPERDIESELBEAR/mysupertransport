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

  useEffect(() => { void load(); }, [load]);

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
      await load();
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
                  <Button size="sm" onClick={() => setConfirming(r)}>Create invoice</Button>
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
                </div>
              )}
            </Card>
          );
        })}
      </div>

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
