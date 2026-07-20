import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FilePlus2, Truck, Send, CheckCircle2, Clock, FileText, Loader2, Ban } from 'lucide-react';
import ICAAmendmentBuilderModal from './ICAAmendmentBuilderModal';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

interface Props {
  operatorId: string;
  operatorName: string;
  /** Only enabled when the parent ICA is fully signed. */
  parentIcaSigned: boolean;
}

type AmendmentRow = {
  id: string;
  amendment_number: number;
  action: 'add_unit' | 'replace_unit';
  status: string;
  effective_date: string | null;
  operator_signed_at: string | null;
  carrier_signed_at: string | null;
  activated_at: string | null;
  created_at: string;
  notes: string | null;
};

export default function ICAAmendmentList({ operatorId, operatorName, parentIcaSigned }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [rows, setRows] = useState<AmendmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [voidingId, setVoidingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('ica_amendments')
      .select('id,amendment_number,action,status,effective_date,operator_signed_at,carrier_signed_at,activated_at,created_at,notes')
      .eq('operator_id', operatorId)
      .order('amendment_number', { ascending: false });
    setRows((data as any) ?? []);
    setLoading(false);
  }, [operatorId]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleVoid = async (id: string, number: number) => {
    if (!window.confirm(`Void Amendment #${number}? This cannot be undone.`)) return;
    setVoidingId(id);
    try {
      const { error } = await supabase
        .from('ica_amendments')
        .update({ status: 'voided', voided_at: new Date().toISOString(), voided_by: user?.id ?? null } as any)
        .eq('id', id);
      if (error) throw error;
      await supabase.from('audit_log').insert({
        actor_id: user?.id ?? null,
        action: 'ica_amendment_voided',
        entity_type: 'ica_amendment',
        entity_id: id,
        entity_label: `Amendment #${number}`,
        metadata: { operator_id: operatorId, operator_name: operatorName },
      });
      toast({ title: 'Amendment voided' });
      refresh();
    } catch (e: any) {
      toast({ title: 'Void failed', description: e.message, variant: 'destructive' });
    } finally {
      setVoidingId(null);
    }
  };

  const statusPill = (s: string) => {
    const map: Record<string, { label: string; className: string; Icon: typeof Clock }> = {
      draft:              { label: 'Draft',                className: 'bg-muted text-foreground',                    Icon: FileText },
      sent_to_operator:   { label: 'Awaiting Operator',    className: 'bg-blue-500/15 text-blue-600 border-blue-500/30', Icon: Send },
      operator_signed:    { label: 'Awaiting Carrier',     className: 'bg-amber-500/15 text-amber-700 border-amber-500/30', Icon: Clock },
      active:             { label: 'Active',               className: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30', Icon: CheckCircle2 },
      voided:             { label: 'Voided',               className: 'bg-destructive/10 text-destructive border-destructive/30', Icon: Ban },
    };
    const cfg = map[s] ?? map.draft;
    const Icon = cfg.Icon;
    return (
      <Badge variant="outline" className={`text-[10px] gap-1 ${cfg.className}`}>
        <Icon className="h-3 w-3" /> {cfg.label}
      </Badge>
    );
  };

  return (
    <div className="pt-2 border-t border-border/60 space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            ICA Amendments
          </div>
          <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
            Modify the leased fleet without re-issuing the entire ICA. Both parties must sign.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="text-xs h-8 gap-1.5 border-gold/50 text-foreground hover:bg-gold/10"
          disabled={!parentIcaSigned}
          title={parentIcaSigned ? 'Draft a new amendment' : 'Requires a signed ICA'}
          onClick={() => setShowBuilder(true)}
        >
          <FilePlus2 className="h-3.5 w-3.5" />
          Amend ICA
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading amendments…
        </div>
      ) : rows.length === 0 ? (
        <p className="text-[11px] text-muted-foreground italic py-1">
          No amendments on file.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map(r => (
            <li
              key={r.id}
              className="p-2 rounded-md border border-border bg-background flex items-start justify-between gap-2"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold flex items-center gap-1">
                    <Truck className="h-3 w-3 text-primary" /> Amendment #{r.amendment_number}
                  </span>
                  {statusPill(r.status)}
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                    {r.action === 'add_unit' ? 'Add Unit' : 'Remove & Replace'}
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  Effective {r.effective_date ?? '—'} · Created {new Date(r.created_at).toLocaleDateString()}
                </div>
                {r.notes && (
                  <div className="text-[11px] text-foreground/80 italic mt-0.5 truncate">
                    “{r.notes}”
                  </div>
                )}
              </div>
              {r.status !== 'active' && r.status !== 'voided' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-[11px] h-7 text-destructive hover:bg-destructive/10"
                  disabled={voidingId === r.id}
                  onClick={() => handleVoid(r.id, r.amendment_number)}
                >
                  {voidingId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Void'}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {showBuilder && (
        <ICAAmendmentBuilderModal
          operatorId={operatorId}
          operatorName={operatorName}
          onClose={() => setShowBuilder(false)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}