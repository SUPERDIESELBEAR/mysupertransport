import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Loader2, Search, MessageSquare } from 'lucide-react';
import { initials } from '@/lib/initials';

export interface DMCandidate {
  user_id: string;
  name: string;
  subtitle: string;
  kind: 'staff' | 'driver';
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Staff callers can message both staff and drivers. */
  callerIsStaff: boolean;
  myUserId: string | null;
  onSelect: (candidate: DMCandidate) => void;
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

/** Loads every person the caller may DM (staff + drivers for staff callers). */
export async function loadDMCandidates(callerIsStaff: boolean, myUserId: string | null): Promise<DMCandidate[]> {
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
      });
    }
  }

  if (callerIsStaff) {
    const { data: ops } = await supabase.from('operators').select('user_id');
    const opIds = (ops ?? []).map(o => o.user_id).filter(id => id !== myUserId);
    if (opIds.length) {
      const { data: opProfs } = await supabase
        .from('profiles').select('user_id, first_name, last_name').in('user_id', opIds);
      for (const p of opProfs ?? []) {
        list.push({
          user_id: p.user_id,
          name: `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Driver',
          subtitle: 'Owner-Operator',
          kind: 'driver',
        });
      }
    }
  }

  list.sort((a, b) => a.name.localeCompare(b.name));
  return list;
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
      <div className="h-8 w-8 shrink-0 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
        <span className="text-primary text-[11px] font-bold">{initials(c.name)}</span>
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