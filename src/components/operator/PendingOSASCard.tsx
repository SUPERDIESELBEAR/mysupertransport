import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { HardDrive, ChevronRight } from 'lucide-react';

interface PendingRow {
  id: string;
  unit_number: string | null;
  status: string;
}

/**
 * Shows an "Onboard Systems Assignment Sheet needs your signature" card on the
 * driver dashboard whenever staff has sent an OSAS that hasn't been signed yet.
 * Tapping the card routes the driver to the in-app OSAS signing view.
 */
export default function PendingOSASCard({
  operatorId,
  onOpen,
}: {
  operatorId: string | null;
  onOpen: () => void;
}) {
  const [rows, setRows] = useState<PendingRow[]>([]);

  useEffect(() => {
    if (!operatorId) { setRows([]); return; }
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from('onboard_assignment_sheets')
        .select('id, unit_number, status')
        .eq('operator_id', operatorId)
        .eq('status', 'sent')
        .order('sent_at', { ascending: false, nullsFirst: false });
      if (!cancelled) setRows((data ?? []) as PendingRow[]);
    };
    load();
    const channel = supabase
      .channel(`osas-pending-${operatorId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'onboard_assignment_sheets', filter: `operator_id=eq.${operatorId}` },
        () => load(),
      )
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [operatorId]);

  if (rows.length === 0) return null;

  const r = rows[0];
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group w-full flex items-center gap-3 p-4 rounded-2xl border-2 border-primary/40 bg-primary/5 text-left shadow-sm transition-all hover:border-primary/60 hover:shadow-md active:scale-[0.99]"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
        <HardDrive className="h-5 w-5" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-foreground">
          Onboard Systems — signature required
        </span>
        <span className="block text-xs text-muted-foreground mt-0.5">
          Review and sign your device assignment sheet{r.unit_number ? ` for Unit ${r.unit_number}` : ''}.
        </span>
      </span>
      <ChevronRight className="h-5 w-5 text-primary shrink-0 transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}