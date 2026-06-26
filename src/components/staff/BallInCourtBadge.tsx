import { useState } from 'react';
import { User, Briefcase } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

export type BallInCourt = 'driver' | 'staff';

interface BallInCourtBadgeProps {
  operatorId: string;
  value: BallInCourt;
  fullyOnboarded: boolean;
  updatedAt?: string | null;
  size?: 'sm' | 'md';
  onChange?: (next: BallInCourt) => void;
}

/**
 * Staff-only handoff indicator. Click to flip the ball between driver and staff.
 * Hidden once the operator is fully onboarded.
 */
export function BallInCourtBadge({
  operatorId,
  value,
  fullyOnboarded,
  updatedAt,
  size = 'sm',
  onChange,
}: BallInCourtBadgeProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);
  const [local, setLocal] = useState<BallInCourt>(value);

  if (fullyOnboarded) return null;

  const isDriver = local === 'driver';
  const styleVars = isDriver
    ? {
        background: 'hsl(var(--muted))',
        color: 'hsl(var(--muted-foreground))',
        borderColor: 'hsl(var(--border))',
      }
    : {
        background: 'hsl(var(--gold) / 0.15)',
        color: 'hsl(var(--gold))',
        borderColor: 'hsl(var(--gold) / 0.45)',
      };

  const sizeClass = size === 'md' ? 'px-2 py-0.5 text-[11px] gap-1' : 'px-1.5 py-0.5 text-[10px] gap-0.5';

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (pending) return;
    const next: BallInCourt = isDriver ? 'staff' : 'driver';
    setPending(true);
    setLocal(next);
    const { error } = await supabase
      .from('onboarding_status')
      .update({
        ball_in_court: next,
        ball_in_court_updated_at: new Date().toISOString(),
        ball_in_court_updated_by: user?.id ?? null,
      })
      .eq('operator_id', operatorId);
    setPending(false);
    if (error) {
      setLocal(local);
      toast({ title: 'Could not update', description: error.message, variant: 'destructive' });
      return;
    }
    onChange?.(next);
    toast({
      title: next === 'staff' ? 'Marked: needs staff action' : 'Marked: waiting on driver',
    });
  };

  const tipDate = updatedAt
    ? new Date(updatedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
    : null;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleClick}
            disabled={pending}
            aria-label={isDriver ? 'Ball in driver court — click to flip to staff' : 'Ball in staff court — click to flip to driver'}
            className={`inline-flex items-center rounded-full font-semibold leading-none border shrink-0 tabular-nums transition-opacity hover:opacity-80 ${sizeClass} ${pending ? 'opacity-60' : ''}`}
            style={styleVars}
          >
            {isDriver ? <User className="h-2.5 w-2.5" /> : <Briefcase className="h-2.5 w-2.5" />}
            {isDriver ? 'Driver' : 'Staff'}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {isDriver ? 'Waiting on driver' : 'Needs staff action'}
          {tipDate && <div className="text-muted-foreground mt-0.5">Updated {tipDate}</div>}
          <div className="text-muted-foreground mt-0.5">Click to flip</div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default BallInCourtBadge;