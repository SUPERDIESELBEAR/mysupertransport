import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, FilePlus, Send, CheckCircle2, Clock, AlertTriangle, RefreshCw, Eye, Trash2 } from 'lucide-react';
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

type Sheet = Database['public']['Tables']['onboard_assignment_sheets']['Row'];
type SheetItem = Database['public']['Tables']['onboard_assignment_sheet_items']['Row'];
type Operator = Database['public']['Tables']['operators']['Row'];

export type SheetWithItems = Sheet & {
  items: SheetItem[];
  operator: (Operator & {
    applications: { first_name: string | null; last_name: string | null; email: string | null; phone: string | null } | null;
  }) | null;
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
  dash_cam: 'Dash Cam',
  bestpass: 'BestPass',
};

export default function SignOffSheetList({ onCreate, onPreview }: Props) {
  const { toast } = useToast();
  const [sheets, setSheets] = useState<SheetWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SheetWithItems | null>(null);

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
    setSheets((data ?? []) as unknown as SheetWithItems[]);
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
      toast({ title: '✅ Reminder sent', description: 'The operator has been emailed again.' });
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
      toast({ title: 'Assignment sheet deleted', description: 'Any assigned devices were released back to inventory.' });
      setConfirmDelete(null);
      fetchSheets();
    } catch (err: any) {
      console.error('[SignOffSheetList] delete exception', err);
      toast({ title: 'Delete failed', description: err?.message ?? 'Could not delete', variant: 'destructive' });
    } finally {
      setDeletingId(null);
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
      ) : (
        <div className="grid gap-3">
          {sheets.map(sheet => {
            const status = sheet.status ?? 'draft';
            const app = sheet.operator?.applications;
            const driverName = [app?.first_name, app?.last_name].filter(Boolean).join(' ').trim() || '—';
            const driverEmail = app?.email ?? null;
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
                    {sheet.signed_at && (
                      <div className="text-xs text-muted-foreground">Signed: {format(new Date(sheet.signed_at), 'MM/dd/yyyy h:mm a')}</div>
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
                      className="text-destructive hover:text-destructive border-destructive/40 hover:bg-destructive/10 ml-auto"
                      onClick={() => setConfirmDelete(sheet)}
                      disabled={deletingId === sheet.id}
                    >
                      {deletingId === sheet.id ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => { if (!v && !deletingId) setConfirmDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this assignment sheet?</AlertDialogTitle>
            <AlertDialogDescription>
              Any devices assigned on this sheet will be released back to inventory. This cannot be undone.
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
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
