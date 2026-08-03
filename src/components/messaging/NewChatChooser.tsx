import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { initials } from '@/lib/initials';
import { ArrowLeft, Loader2, MessageSquare, Search, Users } from 'lucide-react';
import { NewGroupModal } from './NewGroupModal';

export interface DriverContact {
  staff_id: string;
  full_name: string | null;
  avatar_url: string | null;
  role: string | null;
}

export function driverContactRoleLabel(role: string | null | undefined): string {
  switch (role) {
    case 'owner': return 'Owner';
    case 'management': return 'Management';
    case 'dispatcher': return 'Dispatcher';
    case 'onboarding_staff': return 'Onboarding Coordinator';
    default: return 'SUPERTRANSPORT Staff';
  }
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Start (or open) a 1:1 conversation with this staff member. */
  onSelectDirect: (staffUserId: string) => void;
  /** A new group thread was created. */
  onCreatedGroup: (threadId: string) => void;
}

/**
 * Driver-facing "new chat" entry point: choose a direct message or a group chat.
 * Both paths only ever offer staff the driver is permitted to contact.
 */
export function NewChatChooser({ open, onOpenChange, onSelectDirect, onCreatedGroup }: Props) {
  const { user } = useAuth();
  const [step, setStep] = useState<'choose' | 'direct'>('choose');
  const [groupOpen, setGroupOpen] = useState(false);
  const [contacts, setContacts] = useState<DriverContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open) return;
    setStep('choose');
    setSearch('');
  }, [open]);

  useEffect(() => {
    if (!open || !user?.id) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data } = await supabase.rpc('list_driver_contacts', { _driver: user.id });
      if (cancelled) return;
      setContacts((data ?? []) as DriverContact[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, user?.id]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return contacts;
    return contacts.filter(c => (c.full_name ?? '').toLowerCase().includes(q));
  }, [contacts, search]);

  const noContacts = !loading && contacts.length === 0;

  return (
    <>
      <Dialog open={open && !groupOpen} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {step === 'direct' && (
                <button
                  type="button"
                  onClick={() => setStep('choose')}
                  className="h-6 w-6 -ml-1 rounded-full hover:bg-muted flex items-center justify-center"
                  aria-label="Back"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
              )}
              {step === 'choose' ? 'New message' : 'Choose a person'}
            </DialogTitle>
          </DialogHeader>

          {step === 'choose' ? (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setStep('direct')}
                className="w-full flex items-center gap-3 rounded-xl border border-border px-4 py-3 text-left hover:bg-muted/50 transition-colors"
              >
                <div className="h-9 w-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                  <MessageSquare className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">Direct message</p>
                  <p className="text-[11px] text-muted-foreground">A private 1:1 chat with one staff member</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setGroupOpen(true)}
                className="w-full flex items-center gap-3 rounded-xl border border-border px-4 py-3 text-left hover:bg-muted/50 transition-colors"
              >
                <div className="h-9 w-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                  <Users className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">Group chat</p>
                  <p className="text-[11px] text-muted-foreground">One shared thread with several staff members</p>
                </div>
              </button>
              <p className="text-[11px] text-muted-foreground pt-1">
                You can message SUPERTRANSPORT staff assigned to you. Other drivers are not available.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search staff…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-8 h-9 text-sm"
                />
              </div>
              <div className="max-h-72 overflow-y-auto border rounded-md divide-y divide-border/50">
                {loading ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-4 w-4 animate-spin" /></div>
                ) : noContacts ? (
                  <div className="py-8 px-5 text-center">
                    <p className="text-sm font-medium text-foreground/80">No staff available yet</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Your dispatcher and onboarding coordinator will appear here once they're assigned.
                      You can always reply to any staff message you receive.
                    </p>
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="py-8 text-center text-xs text-muted-foreground">No people found</div>
                ) : (
                  filtered.map(c => {
                    const name = c.full_name || 'Staff Member';
                    return (
                      <button
                        key={c.staff_id}
                        type="button"
                        onClick={() => { onSelectDirect(c.staff_id); onOpenChange(false); }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
                      >
                        <div className="h-9 w-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center overflow-hidden shrink-0">
                          {c.avatar_url ? (
                            <img src={c.avatar_url} alt={name} className="h-full w-full object-cover" />
                          ) : (
                            <span className="text-primary text-xs font-bold">{initials(name)}</span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{name}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{driverContactRoleLabel(c.role)}</p>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
              {noContacts && (
                <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>Close</Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {groupOpen && (
        <NewGroupModal
          open={groupOpen}
          onOpenChange={(o) => { setGroupOpen(o); if (!o) onOpenChange(false); }}
          callerIsStaff={false}
          onCreated={(tid) => { setGroupOpen(false); onOpenChange(false); onCreatedGroup(tid); }}
        />
      )}
    </>
  );
}
