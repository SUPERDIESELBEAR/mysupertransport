import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Send, Copy, CheckCircle2, Clock, AlertTriangle, Trash2, Package } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { getEdgeFunctionErrorMessage } from '@/lib/edgeFunctionError';
import type { SheetWithItems } from './SignOffSheetList';
import { useSignatureUrl } from '@/hooks/useSignatureUrl';
import AssignmentSheetTerms from './AssignmentSheetTerms';

const DEVICE_LABELS: Record<string, string> = {
  eld: 'ELD Unit',
  dash_cam: 'Dash Camera',
  license_plate: 'License Plate',
  registration: 'Truck Registration',
  bestpass: 'BestPass',
  ifta_decal: 'IFTA Decal',
};

const STATUS_META: Record<string, { label: string; icon: JSX.Element; variant: 'default' | 'outline' | 'secondary' }> = {
  draft: { label: 'Draft', icon: <Clock className="h-3.5 w-3.5" />, variant: 'secondary' },
  sent: { label: 'Sent to Operator', icon: <Send className="h-3.5 w-3.5" />, variant: 'outline' },
  signed: { label: 'Signed', icon: <CheckCircle2 className="h-3.5 w-3.5" />, variant: 'default' },
  void: { label: 'Void', icon: <AlertTriangle className="h-3.5 w-3.5" />, variant: 'secondary' },
};

interface Props {
  sheet: SheetWithItems | null;
  onClose: () => void;
  onResent?: () => void;
  onDeleted?: () => void;
}

export default function SignOffSheetPreviewModal({ sheet, onClose, onResent, onDeleted }: Props) {
  const [resending, setResending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sendingReturn, setSendingReturn] = useState(false);
  const signature = useSignatureUrl(sheet?.driver_signature_data_url ?? null);

  if (!sheet) return null;

  const app = sheet.operator?.applications;
  const driverName = [app?.first_name, app?.last_name].filter(Boolean).join(' ').trim() || '—';
  const status = sheet.status ?? 'draft';
  const meta = STATUS_META[status] ?? STATUS_META.draft;
  const canResend = status === 'draft' || status === 'sent';
  const returnReceipts = sheet.return_receipts ?? [];

  const signUrl = sheet.access_token
    ? `${window.location.origin}/dashboard?view=onboard-systems&osas_token=${sheet.access_token}`
    : null;

  const handleCopy = async () => {
    if (!signUrl) return;
    try {
      await navigator.clipboard.writeText(signUrl);
      toast.success('Sign link copied');
    } catch {
      toast.error('Could not copy link');
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      const { error } = await supabase.functions.invoke('send-osas-to-operator', {
        body: { sheetId: sheet.id, sendToOperator: true },
      });
      if (error) {
        toast.error('Resend failed', { description: await getEdgeFunctionErrorMessage(error) });
        return;
      }
      toast.success('Reminder sent to operator');
      onResent?.();
      onClose();
    } catch (err: any) {
      toast.error('Resend failed', { description: err?.message ?? 'Could not send' });
    } finally {
      setResending(false);
    }
  };

  const handleDelete = async () => {
    if (!sheet) return;
    setDeleting(true);
    try {
      const { error } = await supabase.functions.invoke('delete-osas-sheet', {
        body: { sheetId: sheet.id },
      });
      if (error) {
        toast.error('Delete failed', { description: await getEdgeFunctionErrorMessage(error) });
        return;
      }
      toast.success('Assignment sheet deleted');
      setConfirmOpen(false);
      onDeleted?.();
      onClose();
    } catch (err: any) {
      toast.error('Delete failed', { description: err?.message ?? 'Could not delete' });
    } finally {
      setDeleting(false);
    }
  };

  const handleSendReturn = async () => {
    setSendingReturn(true);
    try {
      const { error } = await supabase.functions.invoke('send-equipment-return-instructions', {
        body: { sheetId: sheet.id },
      });
      if (error) {
        toast.error('Could not send return instructions', { description: await getEdgeFunctionErrorMessage(error) });
        return;
      }
      toast.success('Return instructions emailed to the driver');
      onResent?.();
      onClose();
    } catch (err: any) {
      toast.error('Could not send return instructions', { description: err?.message ?? 'Send failed' });
    } finally {
      setSendingReturn(false);
    }
  };

  return (
    <Dialog open={!!sheet} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl w-[calc(100vw-2rem)] max-h-[90dvh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="text-lg">Onboard Systems Assignment Sheet</DialogTitle>
              <p className="text-sm text-muted-foreground mt-0.5">{driverName}</p>
            </div>
            <Badge variant={meta.variant} className="shrink-0">
              <span className="flex items-center gap-1.5">{meta.icon}{meta.label}</span>
            </Badge>
          </div>
        </DialogHeader>

        <div className="space-y-4 text-sm min-w-0">
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-md border border-border bg-muted/30 p-3 min-w-0">
            <Field label="Unit Number" value={sheet.unit_number || sheet.operator?.unit_number || '—'} />
            <Field
              label="Assignment Date"
              value={sheet.assignment_date ? format(new Date(sheet.assignment_date + 'T12:00:00'), 'MM/dd/yyyy') : '—'}
            />
            <Field label="Driver Email" value={app?.email || '—'} />
            <Field label="Driver Phone" value={app?.phone || '—'} />
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Assigned Devices</h3>
            <div className="rounded-md border border-border overflow-hidden">
              {sheet.items.length === 0 ? (
                <div className="p-3 text-muted-foreground">No devices listed</div>
              ) : (
                <table className="w-full">
                  <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="text-left px-3 py-2">Type</th>
                      <th className="text-left px-3 py-2">Serial</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sheet.items.map((it) => (
                      <tr key={it.id} className="border-t border-border">
                        <td className="px-3 py-2 font-medium break-words">{DEVICE_LABELS[it.device_type] ?? it.device_type}</td>
                        <td className="px-3 py-2 font-mono break-all">{it.serial_snapshot}</td>
                      </tr>
                    ))}
                    {sheet.bestpass_included && (
                      <tr className="border-t border-border">
                        <td className="px-3 py-2 font-medium">BestPass Fee</td>
                        <td className="px-3 py-2">$60.00 acknowledged</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          <section>
            <AssignmentSheetTerms
              bestpassIncluded={sheet.bestpass_included}
              acknowledgedBy={sheet.driver_signature_name}
              acknowledgedAt={sheet.signed_at ? new Date(sheet.signed_at).toLocaleString('en-US') : null}
            />
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Signature</h3>
            {sheet.signed_at ? (
              <div className="rounded-md border border-border p-3 space-y-2">
                {signature.loading ? (
                  <div className="flex h-24 w-40 items-center justify-center rounded border border-border bg-muted/30 text-xs text-muted-foreground">
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Loading signature…
                  </div>
                ) : signature.url ? (
                  <img
                    src={signature.url}
                    alt="Driver signature"
                    className="max-h-24 bg-white border border-border rounded"
                  />
                ) : signature.blank ? (
                  <div className="flex min-h-24 w-56 items-center justify-center rounded border border-amber-300 bg-amber-50 px-3 text-center text-xs text-amber-900">
                    Signature needs to be re-signed
                  </div>
                ) : sheet.driver_signature_data_url ? (
                  <div className="flex h-24 w-40 items-center justify-center rounded border border-dashed border-border bg-muted/20 px-3 text-center text-xs text-muted-foreground">
                    Signature image unavailable
                  </div>
                ) : null}
                <div className="text-sm">
                  <div className="font-medium">{sheet.driver_signature_name || driverName}</div>
                  <div className="text-xs text-muted-foreground">
                    Signed {format(new Date(sheet.signed_at), 'MM/dd/yyyy h:mm a')}
                    {sheet.driver_ip ? ` • IP ${sheet.driver_ip}` : ''}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-border p-3 text-muted-foreground text-xs">
                Awaiting operator signature.
              </div>
            )}
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Equipment Return</h3>
            {returnReceipts.length > 0 ? (
              <div className="rounded-md border border-status-complete/40 bg-status-complete/10 p-3 space-y-2">
                <div className="flex items-center gap-1.5 text-sm font-medium text-status-complete">
                  <CheckCircle2 className="h-4 w-4" />
                  Return receipt received
                </div>
                {returnReceipts.map((r) => (
                  <div key={r.id} className="text-xs text-muted-foreground">
                    Tracking <span className="font-mono text-foreground">{r.tracking_number ?? '—'}</span>
                    {r.carrier ? ` • ${r.carrier}` : ''} • uploaded {format(new Date(r.uploaded_at), 'MM/dd/yyyy')}
                    {' • '}
                    <a href={r.file_url} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
                      View receipt
                    </a>
                  </div>
                ))}
              </div>
            ) : sheet.return_requested_at ? (
              <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
                Return instructions sent {format(new Date(sheet.return_requested_at), 'MM/dd/yyyy h:mm a')}
                {sheet.return_requested_by_name ? ` by ${sheet.return_requested_by_name}` : ''} — awaiting the driver's shipping receipt.
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-border p-3 text-muted-foreground text-xs">
                No return instructions sent for this sheet yet.
              </div>
            )}
          </section>
        </div>

        <DialogFooter className="flex-row flex-wrap items-center justify-end gap-2 sm:space-x-0">
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive border-destructive/40 hover:bg-destructive/10 mr-auto"
            onClick={() => setConfirmOpen(true)}
            disabled={deleting}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            Delete
          </Button>
          {signUrl && (
            <Button variant="outline" size="sm" onClick={handleCopy}>
              <Copy className="h-3.5 w-3.5 mr-1.5" />
              Copy sign link
            </Button>
          )}
          {canResend && (
            <Button size="sm" onClick={handleResend} disabled={resending}>
              {resending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
              {status === 'draft' ? 'Send to Operator' : 'Resend'}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleSendReturn} disabled={sendingReturn}>
            {sendingReturn ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Package className="h-3.5 w-3.5 mr-1.5" />}
            {sheet.return_requested_at ? 'Resend Return Instructions' : 'Send Return Instructions'}
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
      <AlertDialog open={confirmOpen} onOpenChange={(v) => { if (!deleting) setConfirmOpen(v); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this assignment sheet?</AlertDialogTitle>
            <AlertDialogDescription>
              Any devices assigned on this sheet will be released back to inventory. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 mr-1.5" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-medium break-words">{value}</div>
    </div>
  );
}