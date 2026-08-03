import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Users, Loader2, Search } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

interface Candidate {
  user_id: string;
  name: string;
  subtitle: string;
  kind: 'staff' | 'driver';
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** When true, caller is a staff member (can pick staff + drivers). Otherwise driver mode (staff only). */
  callerIsStaff: boolean;
  /** Called when creation succeeds, with the new thread_id */
  onCreated: (threadId: string) => void;
}

export function NewGroupModal({ open, onOpenChange, callerIsStaff, onCreated }: Props) {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(''); setSelected(new Set()); setSearch('');
    void loadCandidates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, callerIsStaff, user?.id]);

  const loadCandidates = async () => {
    setLoading(true);
    try {
      const list: Candidate[] = [];

      // Driver mode: only staff the driver is permitted to contact.
      if (!callerIsStaff) {
        if (user?.id) {
          const { data: contacts } = await supabase.rpc('list_driver_contacts', { _driver: user.id });
          for (const c of contacts ?? []) {
            list.push({
              user_id: c.staff_id,
              name: c.full_name?.trim() || 'Staff Member',
              subtitle: roleLabel(c.role),
              kind: 'staff',
            });
          }
        }
        list.sort((a, b) => a.name.localeCompare(b.name));
        setCandidates(list);
        return;
      }

      // Staff candidates: all users with a staff role
      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('role', ['owner', 'management', 'onboarding_staff', 'dispatcher']);
      const staffIds = Array.from(new Set((roles ?? []).map(r => r.user_id)));
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

      // Driver candidates (staff mode only)
      const { data: ops } = await supabase.from('operators').select('user_id');
      const opIds = (ops ?? []).map(o => o.user_id);
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

      list.sort((a, b) => a.name.localeCompare(b.name));
      setCandidates(list);
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return candidates;
    return candidates.filter(c => c.name.toLowerCase().includes(q) || c.subtitle.toLowerCase().includes(q));
  }, [candidates, search]);

  const toggle = (id: string) => {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const submit = async () => {
    if (!title.trim()) { toast({ title: 'Group name required', variant: 'destructive' }); return; }
    if (selected.size < 1) { toast({ title: 'Add at least one participant', variant: 'destructive' }); return; }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-group-thread', {
        body: { action: 'create', title: title.trim(), participant_ids: Array.from(selected) },
      });
      if (error || (data as { error?: string })?.error) {
        toast({ title: 'Could not create group', description: (data as { error?: string })?.error ?? error?.message, variant: 'destructive' });
        return;
      }
      onCreated((data as { thread_id: string }).thread_id);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Users className="h-4 w-4" /> New group chat</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Group name (e.g. Safety team, Fleet #12)" value={title} onChange={e => setTitle(e.target.value)} />
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Search people…" value={search} onChange={e => setSearch(e.target.value)} className="pl-8" />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Shared thread — everyone in the group sees replies.
          </p>
          {!callerIsStaff && (
            <p className="text-[11px] text-muted-foreground">
              You can only add SUPERTRANSPORT staff assigned to you — other drivers aren't available.
            </p>
          )}
          <div className="max-h-64 overflow-y-auto border rounded-md divide-y">
            {loading ? (
              <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin" /></div>
            ) : filtered.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">No people found</div>
            ) : (
              (['staff', 'driver'] as const).map(kind => {
                const rows = filtered.filter(c => c.kind === kind);
                if (rows.length === 0) return null;
                const allSelected = rows.every(r => selected.has(r.user_id));
                return (
                  <div key={kind}>
                    <div className="flex items-center justify-between px-3 py-1.5 bg-muted/40">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                        {kind === 'staff' ? 'Staff' : 'Drivers'}
                      </span>
                      <button
                        type="button"
                        className="text-[10px] font-medium text-primary hover:underline"
                        onClick={() => setSelected(prev => {
                          const n = new Set(prev);
                          rows.forEach(r => { if (allSelected) n.delete(r.user_id); else n.add(r.user_id); });
                          return n;
                        })}
                      >
                        {allSelected ? 'Clear' : `Select all ${kind === 'staff' ? 'staff' : 'drivers'}`}
                      </button>
                    </div>
                    {rows.map(c => (
                      <label key={c.user_id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/50 border-t">
                        <Checkbox checked={selected.has(c.user_id)} onCheckedChange={() => toggle(c.user_id)} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{c.name}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{c.subtitle}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                );
              })
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">{selected.size} selected</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={submitting || !title.trim() || selected.size === 0}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Create group
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function roleLabel(r: string | null | undefined): string {
  switch (r) {
    case 'owner': return 'Owner';
    case 'management': return 'Management';
    case 'onboarding_staff': return 'Onboarding Coordinator';
    case 'dispatcher': return 'Dispatcher';
    default: return 'Staff';
  }
}