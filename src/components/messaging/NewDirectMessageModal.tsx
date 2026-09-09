import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Loader2, Search, MessageSquare } from 'lucide-react';
import { initials } from '@/lib/initials';
import {
  deriveLifecycle, audienceSubtitle, reachabilityBlock,
  type MessagingLifecycle, type MessagingDispatchStatus,
} from '@/lib/messagingAudience';
import { ReachabilityBadge } from '@/components/messaging/ReachabilityBadge';

export interface DMCandidate {
  user_id: string;
  name: string;
  subtitle: string;
  kind: 'staff' | 'driver';
  /** Drivers only — staff are always treated as active. */
  lifecycle: MessagingLifecycle;
  dispatchStatus: MessagingDispatchStatus | null;
  operatorId: string | null;
  /** profiles.account_status — feeds reachabilityBlock for drivers. */
  accountStatus: string | null;
}

export function roleLabel(r: string | null | undefined): string {
  switch (r) {
    case 'owner': return 'Owner';
    case 'management': return 'Management';
    case 'onboarding_staff': return 'Onboarding Coordinator';
    case 'dispatcher': return 'Dispatcher';
    default: return 'Staff';
  }
}

/**
 * Loads every person the caller may DM (staff + drivers for staff callers),
 * each tagged with where they stand: active, onboarding, inactive or denied.
 * Denied applicants are dropped unless the caller explicitly asks for them.
 */
export async function loadDMCandidates(
  callerIsStaff: boolean,
  myUserId: string | null,
  opts: { includeDenied?: boolean } = {},
): Promise<DMCandidate[]> {
  const list: DMCandidate[] = [];

  const { data: roles } = await supabase
    .from('user_roles')
    .select('user_id, role')
    .in('role', ['owner', 'management', 'onboarding_staff', 'dispatcher']);
  const staffIds = Array.from(new Set((roles ?? []).map(r => r.user_id))).filter(id => id !== myUserId);
  if (staffIds.length) {
    const { data: profs } = await supabase.rpc('get_staff_contact_info', { _user_ids: staffIds });
    for (const p of profs ?? []) {
      list.push({
        user_id: p.user_id,
        name: `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Staff Member',
        subtitle: roleLabel(p.primary_role),
        kind: 'staff',
        lifecycle: 'active',
        dispatchStatus: null,
        operatorId: null,
        accountStatus: null,
      });
    }
  }

  if (callerIsStaff) {
    const { data: ops } = await supabase
      .from('operators')
      .select(`
        id, user_id, is_active, is_demo, on_hold, is_departing, deactivated_at,
        onboarding_status ( go_live_date, insurance_added_date )
      `);
    const rows = (ops ?? []).filter(o => o.user_id && o.user_id !== myUserId);
    const opIds = rows.map(o => o.id);
    const userIds = rows.map(o => o.user_id as string);

    const [{ data: opProfs }, { data: apps }, { data: terms }, { data: dispatch }] = await Promise.all([
      supabase.from('profiles').select('user_id, first_name, last_name, account_status').in('user_id', userIds),
      supabase.from('applications').select('user_id, review_status').in('user_id', userIds),
      supabase.from('lease_terminations').select('operator_id').in('operator_id', opIds),
      supabase.from('active_dispatch').select('operator_id, dispatch_status').in('operator_id', opIds),
    ]);

    const profileByUser = new Map((opProfs ?? []).map(p => [p.user_id, p]));
    const reviewByUser = new Map((apps ?? []).map(a => [a.user_id, a.review_status as string | null]));
    const terminated = new Set((terms ?? []).map(t => t.operator_id));
    const dispatchByOp = new Map(
      (dispatch ?? []).map(d => [d.operator_id, d.dispatch_status as MessagingDispatchStatus]),
    );

    for (const op of rows) {
      const osRaw = (op as { onboarding_status?: unknown }).onboarding_status;
      const os = (Array.isArray(osRaw) ? osRaw[0] : osRaw) as
        { go_live_date?: string | null; insurance_added_date?: string | null } | null;
      const facts = {
        is_active: op.is_active,
        is_demo: op.is_demo,
        on_hold: op.on_hold,
        is_departing: op.is_departing,
        deactivated_at: op.deactivated_at,
        go_live_date: os?.go_live_date ?? null,
        insurance_added_date: os?.insurance_added_date ?? null,
        review_status: reviewByUser.get(op.user_id as string) ?? null,
        terminated: terminated.has(op.id),
      };
      const lifecycle = deriveLifecycle(facts);
      if (lifecycle === 'denied' && !opts.includeDenied) continue;

      const p = profileByUser.get(op.user_id as string);
      list.push({
        user_id: op.user_id as string,
        name: `${p?.first_name ?? ''} ${p?.last_name ?? ''}`.trim() || 'Driver',
        subtitle: audienceSubtitle(lifecycle, facts),
        kind: 'driver',
        lifecycle,
        dispatchStatus: dispatchByOp.get(op.id) ?? null,
        operatorId: op.id,
        accountStatus: (p?.account_status as string | null) ?? null,
      });
    }
  }

  list.sort((a, b) => a.name.localeCompare(b.name));
  return list;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  callerIsStaff: boolean;
  myUserId: string | null;
  onSelect: (c: DMCandidate) => void;
}


export function NewDirectMessageModal({ open, onOpenChange, callerIsStaff, myUserId, onSelect }: Props) {
  const [candidates, setCandidates] = useState<DMCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setLoading(true);
    void loadDMCandidates(callerIsStaff, myUserId)
      .then(setCandidates)
      .finally(() => setLoading(false));
  }, [open, callerIsStaff, myUserId]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return candidates;
    return candidates.filter(c => c.name.toLowerCase().includes(q) || c.subtitle.toLowerCase().includes(q));
  }, [candidates, search]);

  const staff = filtered.filter(c => c.kind === 'staff');
  const drivers = filtered.filter(c => c.kind === 'driver');

  const row = (c: DMCandidate) => (
    <button
      key={c.user_id}
      onClick={() => { onSelect(c); onOpenChange(false); }}
      className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
    >
      <div className="relative h-8 w-8 shrink-0 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
        <span className="text-primary text-[11px] font-bold">{initials(c.name)}</span>
        {c.kind === 'driver' && (
          <ReachabilityBadge
            reason={reachabilityBlock(c.lifecycle, c.accountStatus, true)}
            className="absolute -bottom-0.5 -right-0.5"
          />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{c.name}</p>
        <p className="text-[11px] text-muted-foreground truncate">{c.subtitle}</p>
      </div>
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" /> New message
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Search people…" value={search} onChange={e => setSearch(e.target.value)} className="pl-8" autoFocus />
          </div>
          <div className="max-h-80 overflow-y-auto border rounded-md divide-y">
            {loading ? (
              <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin" /></div>
            ) : filtered.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">No people found</div>
            ) : (
              <>
                {staff.length > 0 && (
                  <>
                    <div className="px-3 py-1.5 bg-muted/40 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Staff</div>
                    {staff.map(row)}
                  </>
                )}
                {drivers.length > 0 && (
                  <>
                    <div className="px-3 py-1.5 bg-muted/40 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Drivers</div>
                    {drivers.map(row)}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}