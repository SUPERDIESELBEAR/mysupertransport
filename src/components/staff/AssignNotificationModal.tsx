import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Search } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { getEdgeFunctionErrorMessage } from '@/lib/edgeFunctionError';

interface StaffOption {
  user_id: string;
  name: string;
  role: string;
  avatar_url: string | null;
}

interface Props {
  open: boolean;
  notificationIds: string[];
  mode?: 'assign' | 'reassign';
  onClose: () => void;
  onDone?: () => void;
}

export default function AssignNotificationModal({
  open, notificationIds, mode = 'assign', onClose, onDone,
}: Props) {
  const { session } = useAuth();
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [note, setNote] = useState('');
  const [sendPopup, setSendPopup] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAssigneeId(null);
    setSearch('');
    setNote('');
    setSendPopup(true);
    setLoadingStaff(true);
    (async () => {
      const { data: roleRows } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('role', ['onboarding_staff', 'dispatcher', 'management', 'owner']);
      const rolesByUser = new Map<string, string[]>();
      for (const r of (roleRows ?? []) as Array<{ user_id: string; role: string }>) {
        if (!r.user_id || r.user_id === session?.user?.id) continue;
        const arr = rolesByUser.get(r.user_id) ?? [];
        if (!arr.includes(r.role)) arr.push(r.role);
        rolesByUser.set(r.user_id, arr);
      }
      const userIds = Array.from(rolesByUser.keys());
      let profilesById = new Map<string, { first_name: string | null; last_name: string | null; avatar_url: string | null; account_status: string | null }>();
      if (userIds.length) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('user_id, first_name, last_name, avatar_url, account_status')
          .in('user_id', userIds);
        profilesById = new Map(
          (profs ?? []).map((p: any) => [p.user_id as string, p]),
        );
      }
      const list: StaffOption[] = [];
      for (const [uid, roles] of rolesByUser.entries()) {
        const p = profilesById.get(uid);
        if (p?.account_status && p.account_status !== 'active') continue;
        const name = `${p?.first_name ?? ''} ${p?.last_name ?? ''}`.trim() || 'Unknown';
        list.push({ user_id: uid, name, role: roles.join(', '), avatar_url: p?.avatar_url ?? null });
      }
      list.sort((a, b) => a.name.localeCompare(b.name));
      setStaff(list);
      setLoadingStaff(false);
    })();
  }, [open, session?.user?.id]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return staff;
    return staff.filter(s => s.name.toLowerCase().includes(q) || s.role.toLowerCase().includes(q));
  }, [staff, search]);

  const roleLabel = (r: string) => r
    .split(',').map(x => x.trim())
    .map(x => x === 'onboarding_staff' ? 'Onboarding' : x === 'dispatcher' ? 'Dispatcher' : x === 'management' ? 'Management' : x === 'owner' ? 'Owner' : x)
    .join(' · ');

  const handleSubmit = async () => {
    if (!assigneeId || sending || notificationIds.length === 0) return;
    setSending(true);
    try {
      const { error } = await supabase.functions.invoke('assign-notification', {
        body: {
          action: mode,
          notificationIds,
          assigneeUserId: assigneeId,
          note: note.trim() || null,
          sendPopup,
        },
      });
      if (error) {
        const msg = await getEdgeFunctionErrorMessage(error, 'Failed to assign notification.');
        toast.error(msg);
        return;
      }
      const target = staff.find(s => s.user_id === assigneeId);
      toast.success(`${mode === 'reassign' ? 'Re-assigned' : 'Assigned'} to ${target?.name ?? 'teammate'}.`);
      onDone?.();
      onClose();
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === 'reassign' ? 'Re-assign notification' : 'Assign notification'}
            {notificationIds.length > 1 && ` (${notificationIds.length})`}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Assignee</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search staff by name or role…"
                className="pl-9 h-9"
                disabled={sending}
              />
            </div>
            <div className="border border-border rounded-lg max-h-56 overflow-y-auto divide-y divide-border">
              {loadingStaff ? (
                <p className="text-xs text-muted-foreground px-3 py-4">Loading staff…</p>
              ) : filtered.length === 0 ? (
                <p className="text-xs text-muted-foreground px-3 py-4">No matching staff.</p>
              ) : filtered.map(s => (
                <button
                  key={s.user_id}
                  type="button"
                  onClick={() => setAssigneeId(s.user_id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-secondary/50 transition-colors ${
                    assigneeId === s.user_id ? 'bg-gold/15' : ''
                  }`}
                >
                  <div className="h-8 w-8 rounded-full overflow-hidden bg-gold/15 border border-gold/30 flex items-center justify-center shrink-0">
                    {s.avatar_url ? (
                      <img src={s.avatar_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-gold text-[10px] font-bold">
                        {s.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{s.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{roleLabel(s.role)}</p>
                  </div>
                  {assigneeId === s.user_id && <Badge className="bg-gold text-surface-dark">Selected</Badge>}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="assign-note">Note <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea
              id="assign-note"
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 500))}
              rows={4}
              placeholder="Why are you sending this to them?"
              disabled={sending}
            />
            <p className="text-[10px] text-muted-foreground text-right">{note.length}/500</p>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={sendPopup}
              onCheckedChange={(v) => setSendPopup(!!v)}
              disabled={sending}
            />
            <span>Send a pop-up to the assignee now</span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={sending}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!assigneeId || sending}>
            {sending ? 'Sending…' : (mode === 'reassign' ? 'Re-assign' : 'Assign')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}