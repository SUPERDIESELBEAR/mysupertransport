import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, ClipboardList, FileText, Loader2, Printer, Wrench } from 'lucide-react';
import {
  CLOCK_RED, MALFUNCTION_CODE_LABEL, NOTICE_DELIVERY_COPY, NOTICE_DELIVERY_TONE,
  REPAIR_WINDOW_DAYS, getNoticeDeliveryState, repairClockColor,
} from '@/lib/eld/constants';
import { repairDayInZone } from '@/lib/eld/repairClock';
import { ELD_NOTICE_BUCKET } from '@/lib/eld/pendingNotice';
import { renderDutyStatusGrid } from '@/lib/eld/renderDutyStatusGrid';
import type { EldMalfunctionEvent } from '@/hooks/useEldMalfunction';
import ELDExtensionRequestCard from './ELDExtensionRequestCard';

export default function ELDMalfunctionDashboard({
  event,
  onRefresh,
}: {
  event: EldMalfunctionEvent;
  onRefresh: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const basePath = location.pathname.startsWith('/owner') ? '/owner' : '/operator';
  const day = repairDayInZone(event.discovered_at);
  const clockColor = repairClockColor(day);
  const deliveryState = getNoticeDeliveryState(event);
  const deadline = new Date(`${event.repair_deadline}T12:00:00`);
  // The ladder stops escalating the moment `extension_granted_at` is set
  // (escalationLadder.ts:154). The driver's past-deadline notice reads the same
  // field, so the console and the job can never disagree in front of a driver.
  const extensionGranted = !!event.extension_granted_at;

  async function openNotice() {
    if (!event.notice_pdf_path) {
      toast.info(NOTICE_DELIVERY_COPY.not_uploaded);
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.storage
      .from(ELD_NOTICE_BUCKET)
      .createSignedUrl(event.notice_pdf_path, 600);
    setBusy(false);
    if (error || !data?.signedUrl) {
      toast.error('Could not open the notice right now.');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener');
  }

  async function printBlankLogs() {
    setBusy(true);
    try {
      const blob = await renderDutyStatusGrid({ pages: 8, isDemo: event.is_demo === true });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } finally {
      setBusy(false);
    }
  }

  async function reportRepairComplete() {
    setBusy(true);
    const note = `${(event.driver_notes ?? '').trim()}\n[${new Date().toLocaleString()}] Driver reported the repair is complete.`.trim();
    const { error } = await supabase
      .from('eld_malfunction_events')
      .update({ driver_notes: note })
      .eq('id', event.id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Management has been told the repair is done. They will close this out.');
    onRefresh();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-4" style={{ borderColor: clockColor }}>
        <div className="flex items-center gap-2 text-lg font-bold" style={{ color: clockColor }}>
          <AlertTriangle className="h-5 w-5" />
          Day {day} of {REPAIR_WINDOW_DAYS}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Repair deadline {deadline.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </p>
        {day > REPAIR_WINDOW_DAYS && !extensionGranted && (
          <p className="mt-2 text-sm font-semibold" style={{ color: CLOCK_RED }}>
            This repair is past the 8-day federal limit. Management has been notified.
          </p>
        )}
        {extensionGranted && (
          <p className="mt-2 text-sm font-semibold text-muted-foreground">
            FMCSA granted a repair extension
            {event.extension_expires_on
              ? ` through ${new Date(`${event.extension_expires_on}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
              : ''}
            . Keep using paper logs until the repair is done.
          </p>
        )}
      </div>

      <ELDExtensionRequestCard eventId={event.id} />

      <div className="rounded-lg border border-border p-4 space-y-2">
        <div className="text-sm font-semibold text-foreground">Malfunction</div>
        <dl className="grid grid-cols-[130px_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted-foreground">Code</dt>
          <dd>{event.malfunction_code} — {MALFUNCTION_CODE_LABEL[event.malfunction_code]}</dd>
          <dt className="text-muted-foreground">Discovered</dt>
          <dd>{new Date(event.discovered_at).toLocaleString()}</dd>
          <dt className="text-muted-foreground">Location</dt><dd>{event.discovered_location}</dd>
          <dt className="text-muted-foreground">Device</dt>
          <dd>{[event.device_provider, event.device_model, event.device_serial].filter(Boolean).join(' · ') || '—'}</dd>
          <dt className="text-muted-foreground">Paper logs</dt>
          <dd>{event.hinders_hos_recording ? 'Required' : 'Not required'}</dd>
        </dl>
        <p className="text-xs text-muted-foreground">{event.malfunction_description}</p>
      </div>

      <div className="rounded-lg border p-4" style={{ borderColor: NOTICE_DELIVERY_TONE[deliveryState] }}>
        <div className="text-sm font-semibold" style={{ color: NOTICE_DELIVERY_TONE[deliveryState] }}>
          {NOTICE_DELIVERY_COPY[deliveryState]}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={openNotice} disabled={busy || deliveryState === 'not_uploaded'}>
            <FileText className="mr-2 h-4 w-4" /> Open notice PDF
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {event.carrier_acknowledged_at
            ? `Carrier acknowledged ${new Date(event.carrier_acknowledged_at).toLocaleString()}`
            : 'Waiting for carrier acknowledgment.'}
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Button onClick={() => navigate(`${basePath}/paper-logs`)}>
          <ClipboardList className="mr-2 h-4 w-4" /> Open paper logs
        </Button>
        <Button variant="outline" onClick={printBlankLogs} disabled={busy}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
          Print blank log sheets
        </Button>
        <Button variant="outline" onClick={reportRepairComplete} disabled={busy}>
          <Wrench className="mr-2 h-4 w-4" /> Report repair complete
        </Button>
      </div>

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Management closes this record once the device is repaired or replaced. If anything you reported is wrong,
        message your onboarding staff — the record itself is locked because it is a federal notice.
      </p>
    </div>
  );
}