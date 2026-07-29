import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { initials } from '@/lib/initials';
import { MessageSquare, Search, User, ShieldCheck } from 'lucide-react';

interface Contact {
  staff_id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  role: string | null;
  availability_mode: 'all_drivers' | 'specific_drivers' | 'none';
  availability_note: string | null;
  source: 'all_drivers' | 'specific';
}

function roleLabel(role: string | null): string {
  switch (role) {
    case 'owner': return 'Owner';
    case 'management': return 'Management';
    case 'dispatcher': return 'Dispatcher';
    case 'onboarding_staff': return 'Onboarding';
    default: return 'SUPERTRANSPORT Staff';
  }
}

interface Props {
  onStartChat?: (staffUserId: string) => void;
}

/**
 * Shows the driver every staff member they're allowed to message,
 * driven by staff_messaging_settings + driver_staff_contacts (via RPC).
 */
export default function DriverContactsPanel({ onStartChat }: Props) {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data } = await supabase.rpc('list_driver_contacts', { _driver: user.id });
      setContacts((data ?? []) as Contact[]);
      setLoading(false);
    })();
  }, [user?.id]);

  const filtered = contacts.filter((c) => {
    const name = c.full_name?.toLowerCase() ?? '';
    return name.includes(search.toLowerCase());
  });

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="px-4 py-3 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search staff…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-10">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center px-6">
            <User className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm font-medium text-foreground/80">No staff available</p>
            <p className="text-xs text-muted-foreground mt-1">
              Your dispatcher and onboarding coordinator will appear here once you go live.
              You can still reply to any staff message you receive.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border/50">
            {filtered.map((c) => {
              const name = c.full_name || 'Staff Member';
              return (
                <li key={c.staff_id} className="px-4 py-3 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center overflow-hidden shrink-0">
                    {c.avatar_url ? (
                      <img src={c.avatar_url} alt={name} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-primary text-xs font-bold">{initials(name)}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold text-foreground truncate">{name}</p>
                      {c.source === 'specific' && (
                        <span title="Assigned to you" className="text-primary">
                          <ShieldCheck className="h-3.5 w-3.5" />
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">{roleLabel(c.role)}</p>
                    {c.availability_note && (
                      <p className="text-[11px] text-muted-foreground/80 mt-0.5 truncate">{c.availability_note}</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onStartChat?.(c.staff_id)}
                    className="gap-1.5"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    Message
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}