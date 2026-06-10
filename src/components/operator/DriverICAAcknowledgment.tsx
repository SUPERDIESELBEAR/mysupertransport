import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  contractId: string;
}

export default function DriverICAAcknowledgment({ contractId }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [ackAt, setAckAt] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const refresh = async () => {
    if (!user?.id || !contractId) return;
    setLoading(true);
    const { data } = await supabase
      .from('ica_driver_acknowledgments' as any)
      .select('acknowledged_at')
      .eq('contract_id', contractId)
      .eq('driver_user_id', user.id)
      .maybeSingle();
    setAckAt((data as any)?.acknowledged_at ?? null);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, [user?.id, contractId]);

  const handleAck = async () => {
    if (!user?.id || !contractId || !checked) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('ica_driver_acknowledgments' as any)
        .insert({ contract_id: contractId, driver_user_id: user.id });
      if (error) throw error;
      toast.success('Acknowledgment recorded.');
      refresh();
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to record acknowledgment.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return null;

  if (ackAt) {
    return (
      <div className="flex items-center gap-3 p-4 bg-status-complete/10 border border-status-complete/30 rounded-xl">
        <CheckCircle2 className="h-5 w-5 text-status-complete shrink-0" />
        <div>
          <p className="font-semibold text-status-complete text-sm">You acknowledged this ICA</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            On {new Date(ackAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 bg-gold/10 border border-gold/30 rounded-xl space-y-3">
      <div>
        <p className="font-semibold text-foreground text-sm">Read & Acknowledge Required</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Your truck owner has signed your ICA. Please review the full agreement above, then confirm you've read and understand it.
        </p>
      </div>
      <label className="flex items-start gap-2 cursor-pointer">
        <Checkbox checked={checked} onCheckedChange={(v) => setChecked(!!v)} className="mt-0.5" />
        <span className="text-sm text-foreground leading-snug">
          I have read and understand the Independent Contractor Agreement between SUPERTRANSPORT, LLC and my truck owner.
        </span>
      </label>
      <Button
        onClick={handleAck}
        disabled={!checked || submitting}
        className="w-full bg-gold text-surface-dark font-semibold hover:bg-gold-light gap-2"
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
        Record Acknowledgment
      </Button>
    </div>
  );
}