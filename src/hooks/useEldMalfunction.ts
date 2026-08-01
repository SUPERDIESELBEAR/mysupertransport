import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { flushPendingNotices } from '@/lib/eld/pendingNotice';

export type EldMalfunctionEvent = {
  id: string;
  operator_id: string;
  discovered_at: string;
  discovered_location: string;
  malfunction_code: string;
  malfunction_description: string;
  driver_notes: string | null;
  hinders_hos_recording: boolean;
  repair_deadline: string;
  status: string;
  resolved_at: string | null;
  resolution_notes: string | null;
  carrier_acknowledged_at: string | null;
  is_demo?: boolean;
  device_provider: string | null;
  device_make: string | null;
  device_model: string | null;
  device_serial: string | null;
  eld_registration_id: string | null;
  notice_pdf_path: string | null;
  notice_generated_at: string | null;
  notice_uploaded_at: string | null;
  notice_sent_at: string | null;
};

const SELECT = `id, operator_id, discovered_at, discovered_location, malfunction_code,
  malfunction_description, driver_notes, hinders_hos_recording, repair_deadline, status,
  resolved_at, resolution_notes, carrier_acknowledged_at, device_provider, device_make,
  device_model, device_serial, eld_registration_id, notice_pdf_path, notice_generated_at,
  notice_uploaded_at, notice_sent_at, is_demo`;

export function useEldMalfunction(operatorId: string | null) {
  const [activeEvent, setActiveEvent] = useState<EldMalfunctionEvent | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!operatorId) { setActiveEvent(null); setLoading(false); return; }
    const { data } = await supabase
      .from('eld_malfunction_events')
      .select(SELECT)
      .eq('operator_id', operatorId)
      .eq('status', 'open')
      .order('discovered_at', { ascending: false })
      .limit(1);
    setActiveEvent((data?.[0] as EldMalfunctionEvent) ?? null);
    setLoading(false);
  }, [operatorId]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Retry any notice still sitting on this device, on every app foreground.
  useEffect(() => {
    if (!operatorId) return;
    let cancelled = false;

    const attempt = async () => {
      const delivered = await flushPendingNotices();
      if (delivered > 0 && !cancelled) void refresh();
    };

    void attempt();
    const onVisible = () => { if (document.visibilityState === 'visible') void attempt(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', attempt);
    window.addEventListener('focus', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', attempt);
      window.removeEventListener('focus', onVisible);
    };
  }, [operatorId, refresh]);

  return { activeEvent, loading, refresh };
}