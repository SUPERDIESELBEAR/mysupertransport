import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle2, MinusCircle, Circle, History, Loader2 } from 'lucide-react';

const STEP_LABELS: Record<string, string> = {
  reason: 'Reason & Date',
  safety_advisor: 'DOT Consultant Notified',
  lease_termination: 'Lease Termination (Appendix C)',
  equipment_return: 'Equipment Return',
  fuel_card: 'Fuel Card Deactivation',
  mo_plate: 'MO Plate Release',
  ica_void: 'ICA Void',
  login_retention: 'Login Retention',
  confirm: 'Deactivation Finalized',
};

const STEP_ORDER = Object.keys(STEP_LABELS);

interface StepRow {
  step_key: string;
  completed: boolean;
  skipped: boolean;
  skipped_reason: string | null;
  completed_by: string | null;
  completed_at: string | null;
  updated_at: string;
}

export default function OffboardingHistoryPanel({ operatorId }: { operatorId: string }) {
  const [rows, setRows] = useState<StepRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('operator_offboarding_steps')
        .select('step_key, completed, skipped, skipped_reason, completed_by, completed_at, updated_at')
        .eq('operator_id', operatorId);
      if (cancelled) return;
      const list = (data ?? []) as StepRow[];
      setRows(list);

      const ids = Array.from(new Set(list.map(r => r.completed_by).filter(Boolean))) as string[];
      if (ids.length) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, first_name, last_name')
          .in('id', ids);
        if (!cancelled && profiles) {
          setNames(Object.fromEntries(
            (profiles as any[]).map(p => [p.id, [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Staff']),
          ));
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [operatorId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading offboarding history…
      </div>
    );
  }

  if (!rows.length) return null;

  const byKey = Object.fromEntries(rows.map(r => [r.step_key, r]));
  const ordered = STEP_ORDER.filter(k => byKey[k]);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <History className="h-4 w-4 text-gold shrink-0" />
        <h3 className="text-sm font-semibold text-foreground">Offboarding History</h3>
      </div>
      <ul className="divide-y divide-border">
        {ordered.map(key => {
          const r = byKey[key];
          const done = r.completed;
          const skipped = r.skipped;
          const when = r.completed_at || r.updated_at;
          return (
            <li key={key} className="flex items-start gap-3 px-4 py-2.5">
              {done ? (
                <CheckCircle2 className="h-4 w-4 text-status-complete shrink-0 mt-0.5" />
              ) : skipped ? (
                <MinusCircle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground/50 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{STEP_LABELS[key] ?? key}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {done
                    ? `Completed${r.completed_by && names[r.completed_by] ? ` by ${names[r.completed_by]}` : ''}`
                    : skipped
                      ? `Skipped${r.skipped_reason ? ` — ${r.skipped_reason}` : ''}`
                      : 'Not completed'}
                  {when && ` · ${new Date(when).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}`}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}