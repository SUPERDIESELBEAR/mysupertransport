import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, FilePlus, Send, CheckCircle2, Clock, AlertTriangle, RefreshCw, Eye, Trash2, Package } from 'lucide-react';
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
import { format } from 'date-fns';
import type { Database } from '@/integrations/supabase/types';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

type Sheet = Database['public']['Tables']['onboard_assignment_sheets']['Row'];
type SheetItem = Database['public']['Tables']['onboard_assignment_sheet_items']['Row'];
type Operator = Database['public']['Tables']['operators']['Row'];

export type SheetWithItems = Sheet & {
  items: SheetItem[];
  return_receipts?: ReturnReceipt[];
  sends?: SheetSend[];
  operator: (Operator & {
    applications: { first_name: string | null; last_name: string | null; email: string | null; phone: string | null } | null;
  }) | null;
};

export type SheetSend = {
  id: string;
  sheet_id: string;
  sent_at: string;
  sent_by_name: string | null;
  recipient_email: string | null;
  kind: string;
};

export type ReturnReceipt = {
  id: string;
  sheet_id: string | null;
  carrier: string | null;
  tracking_number: string | null;
  file_url: string;
  file_name: string | null;
  uploaded_at: string;
};

interface Props {
  onCreate: () => void;
  onPreview: (sheet: SheetWithItems) => void;
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
  draft: <Clock className="h-3.5 w-3.5" />,
  sent: <Send className="h-3.5 w-3.5" />,
  signed: <CheckCircle2 className="h-3.5 w-3.5" />,
  void: <AlertTriangle className="h-3.5 w-3.5" />,
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  sent: 'Sent to Operator',
  signed: 'Signed',
  void: 'Void',
};

const DEVICE_LABELS: Record<string, string> = {
  eld: 'ELD',
  dash_cam: 'Dash Camera',
  license_plate: 'License Plate',
  registration: 'Truck Registration',
  bestpass: 'BestPass',
};

export default function SignOffSheetList({ onCreate, onPreview }: Props) {
  const { toast } = useToast();
  const [sheets, setSheets] = useState<SheetWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [returnSendingId, setReturnSendingId] = useState<string | null>(null);
  const [confirmReturn, setConfirmReturn] = useState<SheetWithItems | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SheetWithItems | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'sent' | 'signed' | 'void'>('all');

  const fetchSheets = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('onboard_assignment_sheets')
      .select(`
        *,
        items:onboard_assignment_sheet_items(*),
        operator:operator_id(
          *,
          applications(user_id, first_name, last_name, email, phone)
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[SignOffSheetList] fetchSheets failed', error);
      toast({ title: 'Could not load assignment sheets', variant: 'destructive' });
      setSheets([]);
      setLoading(false);
      return;
    }
    const list = (data ?? []) as unknown as SheetWithItems[];

    // Attach return receipts (driver-uploaded shipping receipts) to their sheet.
    const { data: receiptRows } = await supabase
      .from('equipment_receipts')
      .select('id, sheet_id, carrier, tracking_number, file_url, file_name, uploaded_at')
      .eq('direction', 'return')
      .order('uploaded_at', { ascending: false });
    const bySheet = new Map<string, ReturnReceipt[]>();
    for (const r of (receiptRows ?? []) as ReturnReceipt[]) {
      if (!r.sheet_id) continue;
      const arr = bySheet.get(r.sheet_id) ?? [];
      arr.push(r);
      bySheet.set(r.sheet_id, arr);
    }

    // Append-only send history (every send + resend).
    const { data: sendRows } = await supabase
      .from('onboard_assignment_sheet_sends')
      .select('id, sheet_id, sent_at, sent_by_name, recipient_email, kind')
      .order('sent_at', { ascending: false });
    const sendsBySheet = new Map<string, SheetSend[]>();
    for (const s of (sendRows ?? []) as SheetSend[]) {
      const arr = sendsBySheet.get(s.sheet_id) ?? [];
      arr.push(s);
      sendsBySheet.set(s.sheet_id, arr);
    }

    setSheets(list.map(s => ({
      ...s,
      return_receipts: bySheet.get(s.id) ?? [],
      sends: sendsBySheet.get(s.id) ?? [],
    })));
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchSheets();
  }, [fetchSheets]);

  const handleResend = async (sheet: SheetWithItems) => {
    setResendingId(sheet.id);
    try {
      const { error } = await supabase.functions.invoke('send-osas-to-operator', {
        body: {
          sheetId: sheet.id,
          sendToOperator: true,
        },
      });
      if (error) {
        const details = error instanceof Error ? error.message : String(error);
        console.error('[SignOffSheetList] resend failed', error);
        toast({ title: 'Resend failed', description: details, variant: 'destructive' });
        return;
      }
      toast({
        title: sheet.status === 'draft' ? '✅ Assignment sheet sent' : '✅ Reminder sent',
        description: sheet.status === 'draft'
          ? 'The sheet is now recorded as Sent and the operator has been emailed.'
          : 'The operator has been emailed again.',
      });
      fetchSheets();
    } catch (err: any) {
      console.error('[SignOffSheetList] resend exception', err);
      toast({ title: 'Resend failed', description: err?.message ?? 'Could not send', variant: 'destructive' });
    } finally {
      setResendingId(null);
    }
  };

  const handleDelete = async (sheet: SheetWithItems) => {
    setDeletingId(sheet.id);
    try {
      const { error } = await supabase.functions.invoke('delete-osas-sheet', {
        body: { sheetId: sheet.id },
      });
      if (error) {
        const details = error instanceof Error ? error.message : String(error);
        console.error('[SignOffSheetList] delete failed', error);
        toast({ title: 'Delete failed', description: details, variant: 'destructive' });
        return;
      }
      const wasSent = (sheet.status ?? 'draft') !== 'draft' || !!sheet.sent_at;
      toast({
        title: wasSent ? 'Assignment sheet voided' : 'Draft deleted',
        description: wasSent
          ? 'The record is kept and marked Void. Any assigned devices were released back to inventory.'
          : 'Any assigned devices were released back to inventory.',
      });
      setConfirmDelete(null);
      fetchSheets();
    } catch (err: any) {
      console.error('[SignOffSheetList] delete exception', err);
      toast({ title: 'Delete failed', description: err?.message ?? 'Could not delete', variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  };

  const handleSendReturnInstructions = async (sheet: SheetWithItems) => {
    setReturnSendingId(sheet.id);
    try {
      const { error } = await supabase.functions.invoke('send-equipment-return-instructions', {
        body: { sheetId: sheet.id },
      });
      if (error) {
        const details = error instanceof Error ? error.message : String(error);
        console.error('[SignOffSheetList] return instructions failed', error);
        toast({ title: 'Could not send return instructions', description: details, variant: 'destructive' });
        return;
      }
      toast({ title: '📦 Return instructions sent', description: 'The driver has been emailed the mailing addresses.' });
      setConfirmReturn(null);
      fetchSheets();
    } catch (err: any) {
      console.error('[SignOffSheetList] return instructions exception', err);
      toast({ title: 'Could not send return instructions', description: err?.message ?? 'Send failed', variant: 'destructive' });
    } finally {
      setReturnSendingId(null);
    }
  };


  if (loading) {
    return (
      <div className="py-12 flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading assignment sheets…
      </div>
    );
  }

  const counts = {
    all: sheets.length,
    draft: sheets.filter(s => (s.status ?? 'draft') === 'draft').length,
    sent: sheets.filter(s => (s.status ?? 'draft') === 'sent').length,
    signed: sheets.filter(s => (s.status ?? 'draft') === 'signed').length,
    void: sheets.filter(s => (s.status ?? 'draft') === 'void').length,
  };

  const visibleSheets = statusFilter === 'all'
    ? sheets
    : sheets.filter(s => (s.status ?? 'draft') === statusFilter);

  const TAB_DEFS: { value: typeof statusFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'draft', label: 'Drafts' },
    { value: 'sent', label: 'Sent' },
    { value: 'signed', label: 'Signed' },
    { value: 'void', label: 'Void' },
  ];

  const tabBar = (
    <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
      <TabsList className="flex-wrap h-auto">
        {TAB_DEFS.map(t => (
          <TabsTrigger key={t.value} value={t.value} className="gap-1.5">
            {t.label}
            <span className="text-xs text-muted-foreground">{counts[t.value]}</span>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Assignment Sheets</h2>
          <p className="text-sm text-muted-foreground">OSAS records sent to operators for signature.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchSheets}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Refresh
          </Button>
          <Button size="sm" onClick={onCreate}>
            <FilePlus className="h-3.5 w-3.5 mr-1.5" />
            Create Sheet
          </Button>
        </div>
      </div>

      {sheets.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center">
            <p className="text-sm text-muted-foreground">No assignment sheets yet.</p>
            <Button className="mt-3" size="sm" onClick={onCreate}>
              <FilePlus className="h-3.5 w-3.5 mr-1.5" />
              Create Sheet
            </Button>
          </CardContent>
        </Card>
      ) : visibleSheets.length === 0 ? (
        <>
          {tabBar}
          <Card className="border-dashed">
            <CardContent className="py-10 text-center">
              <p className="text-sm text-muted-foreground">No sheets in this view.</p>
            </CardContent>
          </Card>
        </>
      ) : (
        <>
        {tabBar}
        <div className="grid gap-3">
          {visibleSheets.map(sheet => {
            const status = sheet.status ?? 'draft';
            const app = sheet.operator?.applications;
            const driverName = [app?.first_name, app?.last_name].filter(Boolean).join(' ').trim() || '—';
            const driverEmail = app?.email ?? null;
            const returnReceipts = sheet.return_receipts ?? [];
            const returnRequested = !!sheet.return_requested_at;
            return (
              <Card key={sheet.id} className="overflow-hidden">
                <CardHeader className="p-4 pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-base font-semibold truncate">{driverName}</div>
                      <div className="text-sm text-muted-foreground truncate">Unit {sheet.unit_number ?? sheet.operator?.unit_number ?? '—'} • {driverEmail ?? '—'}</div>
                    </div>
                    <Badge variant={status === 'signed' ? 'default' : status === 'sent' ? 'outline' : 'secondary'} className="shrink-0">
                      <span className="flex items-center gap-1.5">
                        {STATUS_ICONS[status] ?? <Clock className="h-3.5 w-3.5" />}
                        {STATUS_LABELS[status] ?? status}
                      </span>
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-3">
                  <div className="text-sm space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Assigned:</span>
                      <span className="font-medium">{sheet.assignment_date ? format(new Date(sheet.assignment_date + 'T12:00:00'), 'MM/dd/yyyy') : '—'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Devices:</span>
                      <span className="font-medium">
                        {sheet.items.length === 0
                          ? 'None'
                          : sheet.items.map(i => `${DEVICE_LABELS[i.device_type] ?? i.device_type} ${i.serial_snapshot}`).join(' • ')}
                      </span>
                    </div>
                    {sheet.bestpass_included && (
                      <div className="text-xs text-muted-foreground">BestPass fee acknowledged: $60.00</div>
                    )}
                    {sheet.sent_at && (() => {
                      const sends = sheet.sends ?? [];
                      const first = sends.length > 0 ? sends[sends.length - 1] : null;
                      const firstAt = first?.sent_at ?? sheet.sent_at;
                      const resendCount = Math.max(sends.length - 1, 0);
                      return (
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          <span>Sent: {format(new Date(firstAt), 'MM/dd/yyyy h:mm a')}</span>
                          {resendCount > 0 && (
                            <Popover>
                              <PopoverTrigger asChild>
                                <button
                                  type="button"
                                  className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-foreground hover:bg-muted"
                                >
                                  Resent {resendCount}x
                                </button>
                              </PopoverTrigger>
                              <PopoverContent align="start" className="w-72 p-3">
                                <div className="mb-2 text-xs font-semibold">Send history</div>
                                <ul className="space-y-2 max-h-56 overflow-y-auto">
                                  {sends.map(s => (
                                    <li key={s.id} className="text-xs">
                                      <div className="font-medium text-foreground">
                                        {format(new Date(s.sent_at), 'MM/dd/yyyy h:mm a')}
                                        <span className="ml-1.5 font-normal text-muted-foreground">
                                          {s.kind === 'initial' ? 'Initial send' : 'Resend'}
                                        </span>
                                      </div>
                                      {(s.sent_by_name || s.recipient_email) && (
                                        <div className="text-muted-foreground">
                                          {s.sent_by_name ? `by ${s.sent_by_name}` : ''}
                                          {s.sent_by_name && s.recipient_email ? ' → ' : ''}
                                          {s.recipient_email ?? ''}
                                        </div>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              </PopoverContent>
                            </Popover>
                          )}
                          {resendCount > 0 && (
                            <span>Last: {format(new Date(sends[0].sent_at), 'MM/dd/yyyy h:mm a')}</span>
                          )}
                        </div>
                      );
                    })()}
                    {sheet.signed_at && (
                      <div className="text-xs text-muted-foreground">Signed: {format(new Date(sheet.signed_at), 'MM/dd/yyyy h:mm a')}</div>
                    )}
                    {returnRequested && returnReceipts.length === 0 && (
                      <div className="mt-2 flex items-center gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-1.5 text-xs text-warning">
                        <Package className="h-3.5 w-3.5 shrink-0" />
                        Return requested {format(new Date(sheet.return_requested_at as string), 'MM/dd/yyyy')}
                        {sheet.return_requested_by_name ? ` by ${sheet.return_requested_by_name}` : ''} — awaiting receipt
                      </div>
                    )}
                    {returnReceipts.length > 0 && (
                      <div className="mt-2 rounded-md border border-status-complete/40 bg-status-complete/10 px-2.5 py-2 text-xs space-y-1">
                        <div className="flex items-center gap-1.5 font-medium text-status-complete">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Return receipt received
                        </div>
                        {returnReceipts.map(r => (
                          <div key={r.id} className="text-muted-foreground">
                            Tracking <span className="font-mono text-foreground">{r.tracking_number ?? '—'}</span>
                            {r.carrier ? ` • ${r.carrier}` : ''} • {format(new Date(r.uploaded_at), 'MM/dd/yyyy')}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-4">
                    <Button size="sm" variant="outline" onClick={() => onPreview(sheet)}>
                      <Eye className="h-3.5 w-3.5 mr-1.5" />
                      View
                    </Button>
                    {(status === 'draft' || status === 'sent') && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleResend(sheet)}
                        disabled={resendingId === sheet.id}
                      >
                        {resendingId === sheet.id && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                        <Send className="h-3.5 w-3.5 mr-1.5" />
                        {status === 'draft' ? 'Send' : 'Resend'}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setConfirmReturn(sheet)}
                      disabled={returnSendingId === sheet.id}
                    >
                      {returnSendingId === sheet.id
                        ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        : <Package className="h-3.5 w-3.5 mr-1.5" />}
                      {returnRequested ? 'Resend Return Instructions' : 'Send Return Instructions'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive border-destructive/40 hover:bg-destructive/10 ml-auto"
                      onClick={() => setConfirmDelete(sheet)}
                      disabled={deletingId === sheet.id || status === 'void'}
                    >
                      {deletingId === sheet.id ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      {status === 'draft' && !sheet.sent_at ? 'Delete' : 'Void'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
        </>
      )}

      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => { if (!v && !deletingId) setConfirmDelete(null); }}>
        {/* delete confirmation */}
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmDelete && ((confirmDelete.status ?? 'draft') !== 'draft' || confirmDelete.sent_at)
                ? 'Void this assignment sheet?'
                : 'Delete this draft assignment sheet?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete && ((confirmDelete.status ?? 'draft') !== 'draft' || confirmDelete.sent_at)
                ? 'This sheet was already sent to the driver, so the record is kept for compliance and marked Void. Any devices assigned on this sheet will be released back to inventory.'
                : 'This draft was never sent, so it will be removed. Any devices assigned on this sheet will be released back to inventory. This cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deletingId}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!!deletingId}
              onClick={(e) => {
                e.preventDefault();
                if (confirmDelete) handleDelete(confirmDelete);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingId ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 mr-1.5" />}
              {confirmDelete && ((confirmDelete.status ?? 'draft') !== 'draft' || confirmDelete.sent_at) ? 'Void' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmReturn} onOpenChange={(v) => { if (!v && !returnSendingId) setConfirmReturn(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Email equipment return instructions?</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const app = confirmReturn?.operator?.applications;
                const name = [app?.first_name, app?.last_name].filter(Boolean).join(' ').trim() || 'this driver';
                return `${name} will be emailed the two mailing addresses, the list of equipment on this sheet, and a button that opens the assignment sheet so they can upload their shipping receipt and tracking number.`;
              })()}
              {confirmReturn?.operator?.applications?.email
                ? ` Sending to ${confirmReturn.operator.applications.email}.`
                : ' No email address is on file for this driver.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!returnSendingId}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!!returnSendingId || !confirmReturn?.operator?.applications?.email}
              onClick={(e) => {
                e.preventDefault();
                if (confirmReturn) handleSendReturnInstructions(confirmReturn);
              }}
            >
              {returnSendingId ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Package className="h-3.5 w-3.5 mr-1.5" />}
              Send Instructions
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
