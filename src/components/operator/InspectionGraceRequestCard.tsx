import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { CalendarClock, Clock, Loader2 } from 'lucide-react';
import {
  inspectionGroup, nextCycleOnOrAfter, cycleStatus, cycleLabel, cycleDeadline,
  CYCLE_STATUS_LABELS, type CycleStatus,
} from '@/lib/inspectionProgram';

// The program tables land when the draft is accepted; generated types do not
// know them yet, so these reads are cast — same pattern as the staff panel.
const db = supabase as any;

interface CycleRow {
  id: string;
  cycle_year: number;
  cycle_month: number;
  status: CycleStatus;
  grace_until: string | null;
  grace_request_status: 'pending' | 'approved' | 'declined' | null;
  grace_request_days: number | null;
  grace_decline_reason: string | null;
  submitted_at: string | null;
  closed_at: string | null;
}

/**
 * The driver's own quarterly-inspection status plus the one action he has on
 * it: asking for more time. A request never grants anything — it goes to
 * staff, and the 12-month allowance is still enforced at approval.
 */
export default function InspectionGraceRequestCard({
  operatorId, unitNumber,
}: {
  operatorId: string;
  unitNumber: string | null | undefined;
}) {
  const [row, setRow] = useState<CycleRow | null>(null);
  const [maxDays, setMaxDays] = useState(15);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState('7');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const group = useMemo(() => inspectionGroup(unitNumber), [unitNumber]);

  const load = useCallback(async () => {
    const [cyclesRes, settingsRes] = await Promise.all([
      db.from('inspection_cycles').select('*')
        .eq('operator_id', operatorId).is('closed_at', null)
        .order('cycle_year', { ascending: false }).order('cycle_month', { ascending: false })
        .limit(1),
      db.from('inspection_program_settings').select('max_grace_days').limit(1).maybeSingle(),
    ]);
    setRow((cyclesRes.data?.[0] as CycleRow) ?? null);
    if (settingsRes.data?.max_grace_days) setMaxDays(settingsRes.data.max_grace_days);
    setLoaded(true);
  }, [operatorId]);

  useEffect(() => { load(); }, [load]);

  if (!group || !loaded) return null;

  const cycleRef = nextCycleOnOrAfter(group, new Date());
  const status = cycleStatus({
    cycle: cycleRef,
    submittedAt: row?.submitted_at,
    closedAt: row?.closed_at,
    graceUntil: row?.grace_until,
  });

  // Nothing to act on once the inspection is in.
  if (status === 'closed' || status === 'submitted') return null;

  const deadline = cycleDeadline(cycleRef, row?.grace_until);
  const requestStatus = row?.grace_request_status ?? null;
  const canRequest = !row?.grace_until && requestStatus !== 'pending';

  const submit = async () => {
    const n = parseInt(days, 10);
    setSaving(true);
    const { error } = await db.rpc('request_inspection_grace', {
      _days: n,
      _reason: reason.trim(),
    });
    setSaving(false);
    if (error) {
      toast({ title: 'Could not send the request', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Request sent', description: 'The office will review it and update your deadline.' });
    setOpen(false);
    setReason('');
    load();
  };

  return (
    <div className="bg-white border border-border rounded-xl shadow-sm p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary" />
          <div>
            <h3 className="font-semibold text-sm text-foreground">Quarterly DOT Inspection</h3>
            <p className="text-[11px] text-muted-foreground">
              {cycleLabel(cycleRef)} · due by {deadline.toLocaleDateString()}
              {row?.grace_until ? ' (extension granted)' : ''}
            </p>
          </div>
        </div>
        <Badge variant="outline" className="text-[10px]">{CYCLE_STATUS_LABELS[status]}</Badge>
      </div>

      {requestStatus === 'pending' && (
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          Your {row?.grace_request_days ?? ''}-day extension request is waiting for office review.
        </p>
      )}
      {requestStatus === 'declined' && (
        <p className="text-[11px] text-destructive bg-destructive/5 border border-destructive/30 rounded-md px-3 py-2">
          Your extension request was declined{row?.grace_decline_reason ? `: ${row.grace_decline_reason}` : '.'}
        </p>
      )}

      {canRequest && (
        <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={() => setOpen(true)}>
          <Clock className="h-3.5 w-3.5" /> Request more time
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-base">Request an inspection extension</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Ask the office for more time on your {cycleLabel(cycleRef)} inspection. Extensions are
              limited — up to {maxDays} days, and only a set number per year.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="grace-days" className="text-xs">Days needed (1–{maxDays})</Label>
              <Input
                id="grace-days"
                type="number"
                min={1}
                max={maxDays}
                value={days}
                onChange={(e) => setDays(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="grace-reason" className="text-xs">Reason</Label>
              <Textarea
                id="grace-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="Why you need more time"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              disabled={saving || !reason.trim() || !days || parseInt(days, 10) < 1 || parseInt(days, 10) > maxDays}
              onClick={submit}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Send request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
