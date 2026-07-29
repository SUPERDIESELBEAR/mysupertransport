import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, UserPlus, X, LogOut, Users } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Participant {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  primary_role: string | null;
  role_in_thread: string;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  threadId: string;
  currentTitle: string;
  createdBy: string | null;
  myUserId: string;
  callerIsStaff: boolean;
  onChanged: () => void;
  onLeft?: () => void;
}

const STAFF_ROLES = new Set(['owner', 'management', 'onboarding_staff', 'dispatcher']);

export function ManageGroupModal({
  open, onOpenChange, threadId, currentTitle, createdBy, myUserId, callerIsStaff, onChanged, onLeft,
}: Props) {
  const [title, setTitle] = useState(currentTitle);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const myRow = participants.find(p => p.user_id === myUserId);
  const isAdmin = createdBy === myUserId || myRow?.role_in_thread === 'admin';

  useEffect(() => { if (open) { setTitle(currentTitle); void load(); } }, [open, threadId]);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.rpc('get_thread_participants', { _thread_id: threadId });
    setParticipants((data ?? []) as Participant[]);
    setLoading(false);
  };

  const call = async (body: unknown) => {
    const { data, error } = await supabase.functions.invoke('manage-group-thread', { body });
    const err = (data as { error?: string })?.error ?? error?.message;
    if (err) { toast({ title: 'Action failed', description: err, variant: 'destructive' }); return false; }
    return true;
  };

  const doRename = async () => {
    if (title.trim() === currentTitle.trim()) return;
    setBusy(true);
    if (await call({ action: 'rename', thread_id: threadId, title: title.trim() })) onChanged();
    setBusy(false);
  };

  const doRemove = async (userId: string) => {
    if (!confirm('Remove this member from the group?')) return;
    setBusy(true);
    if (await call({ action: 'remove', thread_id: threadId, user_id: userId })) { await load(); onChanged(); }
    setBusy(false);
  };

  const doLeave = async () => {
    if (!confirm('Leave this group?')) return;
    setBusy(true);
    if (await call({ action: 'leave', thread_id: threadId })) { onOpenChange(false); onLeft?.(); }
    setBusy(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Users className="h-4 w-4" /> Manage group</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground">Name</label>
              <div className="flex gap-2 mt-1">
                <Input value={title} onChange={e => setTitle(e.target.value)} disabled={!isAdmin || busy} />
                {isAdmin && (
                  <Button size="sm" onClick={doRename} disabled={busy || !title.trim() || title.trim() === currentTitle.trim()}>Save</Button>
                )}
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-semibold text-muted-foreground">Members ({participants.length})</label>
                {isAdmin && (
                  <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
                    <UserPlus className="h-3.5 w-3.5 mr-1" /> Add
                  </Button>
                )}
              </div>
              <div className="border rounded-md divide-y max-h-64 overflow-y-auto">
                {loading ? (
                  <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin" /></div>
                ) : participants.map(p => {
                  const name = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'User';
                  const isStaffMember = STAFF_ROLES.has(p.primary_role ?? '');
                  return (
                    <div key={p.user_id} className="flex items-center gap-2 px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">
                          {name}
                          {p.user_id === myUserId && <span className="text-muted-foreground"> (you)</span>}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {isStaffMember ? 'Staff' : 'Driver'}
                          {(p.user_id === createdBy || p.role_in_thread === 'admin') && ' · admin'}
                        </p>
                      </div>
                      {isAdmin && p.user_id !== myUserId && (
                        <Button size="icon" variant="ghost" onClick={() => doRemove(p.user_id)} disabled={busy} aria-label="Remove">
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            {callerIsStaff && (
              <Button variant="outline" onClick={doLeave} disabled={busy} className="w-full">
                <LogOut className="h-4 w-4 mr-2" /> Leave group
              </Button>
            )}
            {!callerIsStaff && (
              <p className="text-[11px] text-muted-foreground text-center">Only staff members can leave a group. Ask an admin to remove you.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {addOpen && (
        <AddParticipantsModal
          open={addOpen}
          onOpenChange={setAddOpen}
          threadId={threadId}
          existingIds={new Set(participants.map(p => p.user_id))}
          callerIsStaff={callerIsStaff}
          onAdded={async () => { await load(); onChanged(); }}
        />
      )}
    </>
  );
}

function AddParticipantsModal({ open, onOpenChange, threadId, existingIds, callerIsStaff, onAdded }: {
  open: boolean; onOpenChange: (o: boolean) => void; threadId: string;
  existingIds: Set<string>; callerIsStaff: boolean; onAdded: () => void;
}) {
  // Reuse NewGroupModal logic by triggering an 'add' after selection.
  // Simpler: inline small picker.
  const [candidates, setCandidates] = useState<{ user_id: string; name: string; kind: 'staff'|'driver' }[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const list: { user_id: string; name: string; kind: 'staff'|'driver' }[] = [];
      const { data: roles } = await supabase.from('user_roles').select('user_id, role')
        .in('role', ['owner','management','onboarding_staff','dispatcher']);
      const staffIds = Array.from(new Set((roles ?? []).map(r => r.user_id))).filter(id => !existingIds.has(id));
      if (staffIds.length) {
        const { data: profs } = await supabase.rpc('get_staff_contact_info', { _user_ids: staffIds });
        for (const p of profs ?? []) list.push({
          user_id: p.user_id,
          name: `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Staff',
          kind: 'staff',
        });
      }
      if (callerIsStaff) {
        const { data: ops } = await supabase.from('operators').select('user_id');
        const opIds = (ops ?? []).map(o => o.user_id).filter(id => !existingIds.has(id));
        if (opIds.length) {
          const { data: profs } = await supabase.from('profiles').select('user_id, first_name, last_name').in('user_id', opIds);
          for (const p of profs ?? []) list.push({
            user_id: p.user_id,
            name: `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Driver',
            kind: 'driver',
          });
        }
      }
      list.sort((a,b) => a.name.localeCompare(b.name));
      setCandidates(list);
    })();
  }, [existingIds, callerIsStaff]);

  const submit = async () => {
    if (selected.size === 0) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('manage-group-thread', {
      body: { action: 'add', thread_id: threadId, participant_ids: Array.from(selected) },
    });
    const err = (data as { error?: string })?.error ?? error?.message;
    if (err) { toast({ title: 'Add failed', description: err, variant: 'destructive' }); setBusy(false); return; }
    onAdded();
    onOpenChange(false);
    setBusy(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add members</DialogTitle></DialogHeader>
        <div className="max-h-72 overflow-y-auto border rounded-md divide-y">
          {candidates.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">No people to add</div>
          ) : candidates.map(c => (
            <label key={c.user_id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/50">
              <input type="checkbox" checked={selected.has(c.user_id)} onChange={() => {
                setSelected(prev => { const n = new Set(prev); n.has(c.user_id) ? n.delete(c.user_id) : n.add(c.user_id); return n; });
              }} />
              <span className="text-sm flex-1">{c.name}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${c.kind==='staff'?'bg-primary/10 text-primary':'bg-muted text-muted-foreground'}`}>{c.kind === 'staff' ? 'Staff' : 'Driver'}</span>
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy || selected.size === 0}>Add {selected.size || ''}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}