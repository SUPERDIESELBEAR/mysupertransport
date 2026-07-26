import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { HardDrive, CheckCircle2, Clock, ChevronRight, Cpu, Camera, Gauge } from 'lucide-react';
import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useSignatureUrl } from '@/hooks/useSignatureUrl';
import AssignmentSheetTerms from '@/components/equipment/AssignmentSheetTerms';

type DeviceType = 'eld' | 'dash_cam' | 'bestpass';

type Sheet = {
  id: string;
  unit_number: string | null;
  assignment_date: string | null;
  status: 'draft' | 'sent' | 'signed' | 'void';
  signed_at: string | null;
  sent_at: string | null;
  driver_signature_data_url: string | null;
  driver_signature_name: string | null;
  bestpass_included: boolean | null;
  driver_ip: string | null;
  terms_version: string | null;
  return_requested_at: string | null;
  return_completed_at: string | null;
};

type Item = {
  id: string;
  sheet_id: string;
  device_type: DeviceType;
  serial_snapshot: string;
};

const DEVICE_LABEL: Record<DeviceType, string> = {
  eld: 'ELD Unit',
  dash_cam: 'Dash Camera',
  bestpass: 'BestPass',
};

const DEVICE_ICON: Record<DeviceType, React.ReactNode> = {
  eld: <Cpu className="h-4 w-4 text-primary" />,
  dash_cam: <Camera className="h-4 w-4 text-primary" />,
  bestpass: <Gauge className="h-4 w-4 text-primary" />,
};

interface Props {
  operatorId: string;
}

export default function SignedAssignmentSheetsCard({ operatorId, embedded = false, onSummary }: Props) {
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [itemsBySheet, setItemsBySheet] = useState<Record<string, Item[]>>({});
  const [loading, setLoading] = useState(true);
  const [previewId, setPreviewId] = useState<string | null>(null);

  useEffect(() => {
    if (!operatorId) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const { data: sheetRows } = await supabase
        .from('onboard_assignment_sheets')
        .select('id, unit_number, assignment_date, status, signed_at, sent_at, driver_signature_data_url, driver_signature_name, bestpass_included, driver_ip, terms_version, return_requested_at, return_completed_at')
        .eq('operator_id', operatorId)
        .in('status', ['signed', 'sent'])
        .order('signed_at', { ascending: false, nullsFirst: false })
        .order('sent_at', { ascending: false, nullsFirst: false });
      const list = (sheetRows ?? []) as Sheet[];
      let itemMap: Record<string, Item[]> = {};
      if (list.length > 0) {
        const { data: itemRows } = await supabase
          .from('onboard_assignment_sheet_items')
          .select('id, sheet_id, device_type, serial_snapshot')
          .in('sheet_id', list.map((s) => s.id));
        for (const it of (itemRows ?? []) as Item[]) {
          (itemMap[it.sheet_id] ??= []).push(it);
        }
      }
      if (!cancelled) {
        setSheets(list);
        setItemsBySheet(itemMap);
        setLoading(false);
      }
    };
    load();
    const channel = supabase
      .channel(`osas-mydocs-${operatorId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'onboard_assignment_sheets', filter: `operator_id=eq.${operatorId}` },
        () => load(),
      )
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [operatorId]);

  const preview = sheets.find((s) => s.id === previewId) ?? null;
  const previewItems = preview ? (itemsBySheet[preview.id] ?? []) : [];
  const signature = useSignatureUrl(preview?.driver_signature_data_url ?? null);

  const awaitingReturnSummary = sheets.some((s) => s.return_requested_at && !s.return_completed_at);
  useEffect(() => {
    if (loading) return;
    onSummary?.({ count: sheets.length, actionNeeded: awaitingReturnSummary });
  }, [loading, sheets.length, awaitingReturnSummary, onSummary]);

  if (loading) return null;
  if (sheets.length === 0) return null;

  const awaitingReturn = sheets.some((s) => s.return_requested_at && !s.return_completed_at);

  return (
    <div className={embedded ? 'space-y-3' : 'rounded-2xl border border-border bg-card p-4 space-y-3'}>
      {!embedded && (
        <div className="flex items-center gap-2">
          <HardDrive className="h-5 w-5 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Onboard Systems Assignment Sheets</h3>
        </div>
      )}
      {awaitingReturn && (
        <button
          type="button"
          onClick={() => document.getElementById('equipment-return')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          className="w-full rounded-xl border border-primary/40 bg-primary/10 p-3 text-left"
        >
          <span className="block text-sm font-medium text-foreground">Return requested — upload your shipping receipt</span>
          <span className="block text-xs text-muted-foreground mt-0.5">Tap here to jump to the Return Your Equipment section.</span>
        </button>
      )}
      <div className="space-y-2">
        {sheets.map((s) => {
          const isSigned = s.status === 'signed';
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setPreviewId(s.id)}
              className="group w-full flex items-center gap-3 rounded-xl border border-border bg-background/50 p-3 text-left transition-colors hover:bg-muted/50"
            >
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${isSigned ? 'bg-status-complete/15 text-status-complete' : 'bg-primary/15 text-primary'}`}>
                {isSigned ? <CheckCircle2 className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-foreground">
                  Assignment Sheet{s.unit_number ? ` — Unit ${s.unit_number}` : ''}
                </span>
                <span className="block text-xs text-muted-foreground mt-0.5">
                  {isSigned && s.signed_at
                    ? `Signed ${format(new Date(s.signed_at), 'MM/dd/yyyy')}`
                    : s.sent_at
                    ? `Sent ${format(new Date(s.sent_at), 'MM/dd/yyyy')} — awaiting signature`
                    : 'Awaiting signature'}
                </span>
              </span>
              <Badge variant={isSigned ? 'default' : 'outline'} className="shrink-0">
                {isSigned ? 'Signed' : 'Pending'}
              </Badge>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
          );
        })}
      </div>

      <Dialog open={!!preview} onOpenChange={(v) => { if (!v) setPreviewId(null); }}>
        <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">Assignment Sheet{preview?.unit_number ? ` — Unit ${preview.unit_number}` : ''}</DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3 rounded-md border border-border bg-muted/30 p-3">
                <Field label="Assignment Date" value={preview.assignment_date ? format(new Date(preview.assignment_date + 'T12:00:00'), 'MM/dd/yyyy') : '—'} />
                <Field label="Status" value={preview.status === 'signed' ? 'Signed' : preview.status === 'sent' ? 'Sent — pending' : preview.status} />
                <Field label="Unit" value={preview.unit_number || '—'} />
                <Field label="Driver" value={preview.driver_signature_name || '—'} />
              </div>

              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Assigned Devices</h4>
                <div className="rounded-md border border-border overflow-hidden">
                  {previewItems.length === 0 ? (
                    <div className="p-3 text-muted-foreground text-xs">No devices listed</div>
                  ) : (
                    <ul className="divide-y divide-border">
                      {previewItems.map((it) => (
                        <li key={it.id} className="flex items-center gap-2 px-3 py-2">
                          {DEVICE_ICON[it.device_type]}
                          <span className="font-medium">{DEVICE_LABEL[it.device_type] ?? it.device_type}</span>
                          <span className="ml-auto font-mono text-xs text-muted-foreground">{it.serial_snapshot}</span>
                        </li>
                      ))}
                      {preview.bestpass_included && (
                        <li className="flex items-center gap-2 px-3 py-2">
                          <Gauge className="h-4 w-4 text-primary" />
                          <span className="font-medium">BestPass Fee</span>
                          <span className="ml-auto text-xs text-muted-foreground">$60.00 acknowledged</span>
                        </li>
                      )}
                    </ul>
                  )}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Terms You Agreed To</h4>
                <AssignmentSheetTerms
                  bestpassIncluded={preview.bestpass_included}
                  acknowledgedBy={preview.driver_signature_name}
                  acknowledgedAt={preview.signed_at ? format(new Date(preview.signed_at), 'MM/dd/yyyy h:mm a') : null}
                />
                {preview.terms_version && (
                  <p className="mt-1 text-[11px] text-muted-foreground">Terms version {preview.terms_version}</p>
                )}
              </div>

              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Your Signature</h4>
                {preview.signed_at ? (
                  <div className="rounded-md border border-border p-3 space-y-2">
                    {signature.loading ? (
                      <div className="flex h-24 w-40 items-center justify-center rounded border border-border bg-muted/30 text-xs text-muted-foreground">
                        Loading signature…
                      </div>
                    ) : signature.url ? (
                      <img
                        src={signature.url}
                        alt="Your signature"
                        className="max-h-24 bg-white border border-border rounded"
                      />
                    ) : signature.blank ? (
                      <div className="flex min-h-24 w-56 items-center justify-center rounded border border-amber-300 bg-amber-50 px-3 text-center text-xs text-amber-900">
                        Signature needs to be re-signed
                      </div>
                    ) : preview.driver_signature_data_url ? (
                      <div className="flex h-24 w-40 items-center justify-center rounded border border-dashed border-border bg-muted/20 px-3 text-center text-xs text-muted-foreground">
                        Signature image unavailable
                      </div>
                    ) : null}
                    <div className="text-xs text-muted-foreground">
                      {preview.driver_signature_name ? <div className="text-sm font-medium text-foreground">{preview.driver_signature_name}</div> : null}
                      Signed {format(new Date(preview.signed_at), 'MM/dd/yyyy h:mm a')}
                      {preview.driver_ip ? ` • IP ${preview.driver_ip}` : ''}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed border-border p-3 text-muted-foreground text-xs">
                    Not yet signed.
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setPreviewId(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}