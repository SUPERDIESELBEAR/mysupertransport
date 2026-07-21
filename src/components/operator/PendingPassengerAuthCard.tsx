import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { UserCheck, ChevronRight } from 'lucide-react';

interface PendingRow {
  id: string;
  response_token: string;
  unit_number: string | null;
  status: string;
}

/**
 * Shows a "Passenger Authorization required" action card on the driver's
 * dashboard when staff has sent them a Passenger Authorization link that has
 * not yet been completed. Tapping the card opens the tokenized signing page
 * (`/passenger-auth/:token`) — the same destination the emailed link uses.
 */
export default function PendingPassengerAuthCard({ operatorId }: { operatorId: string | null }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<PendingRow[]>([]);

  useEffect(() => {
    if (!operatorId) { setRows([]); return; }
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from('passenger_authorizations')
        .select('id, response_token, unit_number, status')
        .eq('operator_id', operatorId)
        .in('status', ['sent', 'opened'])
        .order('created_at', { ascending: false });
      if (!cancelled) setRows((data ?? []) as PendingRow[]);
    };
    load();
    const channel = supabase
      .channel(`pass-auth-${operatorId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'passenger_authorizations', filter: `operator_id=eq.${operatorId}` },
        () => load(),
      )
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [operatorId]);

  if (rows.length === 0) return null;

  return (
    <div className="space-y-2">
      {rows.map(r => (
        <button
          key={r.id}
          type="button"
          onClick={() => navigate(`/passenger-auth/${r.response_token}`)}
          className="group w-full flex items-center gap-3 p-4 rounded-2xl border-2 border-primary/40 bg-primary/5 text-left shadow-sm transition-all hover:border-primary/60 hover:shadow-md active:scale-[0.99]"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <UserCheck className="h-5 w-5" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold text-foreground">Passenger Authorization required</span>
            <span className="block text-xs text-muted-foreground mt-0.5">
              Complete Authorization #1{r.unit_number ? ` for Unit ${r.unit_number}` : ''} and sign the form.
            </span>
          </span>
          <ChevronRight className="h-5 w-5 text-primary shrink-0 transition-transform group-hover:translate-x-0.5" />
        </button>
      ))}
    </div>
  );
}