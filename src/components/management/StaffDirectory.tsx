import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  UserPlus, RefreshCcw, Mail, Shield, Truck, Users,
  Search, X, ChevronDown, Clock, CheckCircle2
} from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';

type AppRole = Database['public']['Enums']['app_role'];
type StaffRole = 'onboarding_staff' | 'dispatcher' | 'management';

interface StaffMember {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email?: string;
  account_status: string;
  created_at: string;
  updated_at: string;
  roles: AppRole[];
}

const ROLE_CONFIG: Record<StaffRole, { label: string; icon: React.ReactNode; color: string }> = {
  management: {
    label: 'Management',
    icon: <Shield className="h-3 w-3" />,
    color: 'bg-gold/15 text-gold-muted border-gold/30',
  },
  onboarding_staff: {
    label: 'Onboarding Staff',
    icon: <Users className="h-3 w-3" />,
    color: 'bg-status-complete/15 text-status-complete border-status-complete/30',
  },
  dispatcher: {
    label: 'Dispatcher',
    icon: <Truck className="h-3 w-3" />,
    color: 'bg-blue-500/15 text-blue-600 border-blue-300',
  },
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  active: { label: 'Active', color: 'bg-status-complete/15 text-status-complete border-status-complete/30' },
  pending: { label: 'Pending', color: 'bg-status-in-progress/15 text-status-in-progress border-status-in-progress/30' },
  inactive: { label: 'Inactive', color: 'bg-muted text-muted-foreground border-border' },
  denied: { label: 'Denied', color: 'bg-destructive/15 text-destructive border-destructive/30' },
};

export default function StaffDirectory() {
  const { session } = useAuth();
  const { toast } = useToast();

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<StaffRole | 'all'>('all');

  // Invite modal
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteFirstName, setInviteFirstName] = useState('');
  const [inviteLastName, setInviteLastName] = useState('');
  const [inviteRole, setInviteRole] = useState<StaffRole>('onboarding_staff');
  const [inviting, setInviting] = useState(false);

  const fetchStaff = useCallback(async () => {
    setLoading(true);
    try {
      // Get all staff roles
      const { data: roleRows } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('role', ['management', 'onboarding_staff', 'dispatcher'] as AppRole[]);

      if (!roleRows?.length) {
        setStaff([]);
        return;
      }

      const staffUserIds = [...new Set(roleRows.map(r => r.user_id))];

      // Get profiles for those user_ids
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name, account_status, created_at, updated_at')
        .in('user_id', staffUserIds);

      if (!profiles) return;

      // Merge roles into profiles
      const merged: StaffMember[] = profiles.map(p => ({
        ...p,
        roles: roleRows.filter(r => r.user_id === p.user_id).map(r => r.role),
      }));

      setStaff(merged);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      const { data, error } = await supabase.functions.invoke('invite-staff', {
        body: {
          email: inviteEmail.trim().toLowerCase(),
          role: inviteRole,
          first_name: inviteFirstName.trim() || undefined,
          last_name: inviteLastName.trim() || undefined,
        },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: '✅ Invitation Sent',
        description: `${inviteEmail} has been invited as ${ROLE_CONFIG[inviteRole].label}.`,
      });
      setShowInvite(false);
      setInviteEmail('');
      setInviteFirstName('');
      setInviteLastName('');
      setInviteRole('onboarding_staff');
      await fetchStaff();
    } catch (err) {
      toast({
        title: 'Invite Failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setInviting(false);
    }
  };

  const filteredStaff = staff.filter(s => {
    const matchesRole = roleFilter === 'all' || s.roles.includes(roleFilter as AppRole);
    if (!matchesRole) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const name = `${s.first_name ?? ''} ${s.last_name ?? ''}`.toLowerCase();
    return name.includes(q) || (s.email ?? '').toLowerCase().includes(q);
  });

  const counts = {
    all: staff.length,
    management: staff.filter(s => s.roles.includes('management')).length,
    onboarding_staff: staff.filter(s => s.roles.includes('onboarding_staff')).length,
    dispatcher: staff.filter(s => s.roles.includes('dispatcher')).length,
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Staff Directory</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {staff.length} staff member{staff.length !== 1 ? 's' : ''} across all roles
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchStaff} disabled={loading} className="gap-1.5">
            <RefreshCcw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setShowInvite(true)} className="gap-1.5 bg-surface-dark text-surface-dark-foreground hover:bg-surface-dark/90">
            <UserPlus className="h-4 w-4" />
            Invite Staff Member
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full pl-9 pr-4 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gold/30"
          />
        </div>

        <div className="flex rounded-lg border border-border bg-white overflow-hidden shrink-0">
          {(['all', 'management', 'onboarding_staff', 'dispatcher'] as const).map(r => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`px-3 py-2 text-xs font-medium transition-colors border-r border-border last:border-0 whitespace-nowrap ${
                roleFilter === r
                  ? 'bg-surface-dark text-white'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
              }`}
            >
              {r === 'all' ? 'All' : r === 'onboarding_staff' ? 'Onboarding' : r.charAt(0).toUpperCase() + r.slice(1)}
              <span className="ml-1.5 opacity-60">({counts[r]})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Staff Table */}
      <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-muted-foreground text-sm">Loading staff…</div>
        ) : filteredStaff.length === 0 ? (
          <div className="py-16 text-center">
            <Users className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">
              {staff.length === 0 ? 'No staff members found. Invite your first team member!' : 'No staff members match the current filter.'}
            </p>
            {staff.length === 0 && (
              <Button
                size="sm"
                className="mt-4 bg-surface-dark text-surface-dark-foreground hover:bg-surface-dark/90"
                onClick={() => setShowInvite(true)}
              >
                <UserPlus className="h-4 w-4 mr-1.5" /> Invite First Staff Member
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* Table header */}
            <div className="grid grid-cols-12 px-5 py-3 bg-secondary/50 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b border-border">
              <span className="col-span-4">Name</span>
              <span className="col-span-3">Roles</span>
              <span className="col-span-2">Status</span>
              <span className="col-span-3">Last Updated</span>
            </div>

            <div className="divide-y divide-border">
              {filteredStaff.map(member => {
                const name = [member.first_name, member.last_name].filter(Boolean).join(' ') || '(No name set)';
                const statusCfg = STATUS_CONFIG[member.account_status] ?? STATUS_CONFIG.pending;

                return (
                  <div key={member.user_id} className="grid grid-cols-12 items-center px-5 py-4 hover:bg-secondary/20 transition-colors">
                    {/* Name */}
                    <div className="col-span-4">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-surface-dark flex items-center justify-center shrink-0">
                          <span className="text-sm font-semibold text-gold">
                            {(member.first_name?.[0] ?? member.last_name?.[0] ?? '?').toUpperCase()}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">{name}</p>
                          <p className="text-xs text-muted-foreground">
                            Joined {formatDate(member.created_at)}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Roles */}
                    <div className="col-span-3 flex flex-wrap gap-1.5">
                      {member.roles
                        .filter(r => ['management', 'onboarding_staff', 'dispatcher'].includes(r))
                        .map(r => {
                          const cfg = ROLE_CONFIG[r as StaffRole];
                          return (
                            <Badge key={r} className={`text-xs border gap-1 ${cfg.color}`}>
                              {cfg.icon}
                              {cfg.label}
                            </Badge>
                          );
                        })}
                    </div>

                    {/* Status */}
                    <div className="col-span-2">
                      <Badge className={`text-xs border ${statusCfg.color}`}>
                        {statusCfg.label}
                      </Badge>
                    </div>

                    {/* Last Updated */}
                    <div className="col-span-3">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="h-3.5 w-3.5 shrink-0" />
                        {formatDate(member.updated_at)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <p className="text-xs text-muted-foreground text-right">
        Showing {filteredStaff.length} of {staff.length} staff member{staff.length !== 1 ? 's' : ''}
      </p>

      {/* ── Invite Modal ── */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowInvite(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md animate-scale-in">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-border">
              <div>
                <h2 className="text-lg font-bold text-foreground">Invite Staff Member</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Send a role-specific invitation email</p>
              </div>
              <button onClick={() => setShowInvite(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleInvite} className="px-6 py-5 space-y-4">
              {/* Name row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">First Name</label>
                  <input
                    type="text"
                    value={inviteFirstName}
                    onChange={e => setInviteFirstName(e.target.value)}
                    placeholder="Jane"
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gold/30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Last Name</label>
                  <input
                    type="text"
                    value={inviteLastName}
                    onChange={e => setInviteLastName(e.target.value)}
                    placeholder="Smith"
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gold/30"
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Email Address <span className="text-destructive">*</span>
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    placeholder="jane@supertransportllc.com"
                    className="w-full pl-9 pr-4 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gold/30"
                  />
                </div>
              </div>

              {/* Role */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Role <span className="text-destructive">*</span>
                </label>
                <div className="relative">
                  <select
                    value={inviteRole}
                    onChange={e => setInviteRole(e.target.value as StaffRole)}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-gold/30 pr-8"
                  >
                    <option value="onboarding_staff">Onboarding Staff</option>
                    <option value="dispatcher">Dispatcher</option>
                    <option value="management">Management</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                </div>

                {/* Role description */}
                <div className={`mt-2 px-3 py-2 rounded-lg text-xs border ${ROLE_CONFIG[inviteRole].color}`}>
                  <div className="flex items-center gap-1.5 font-medium mb-0.5">
                    {ROLE_CONFIG[inviteRole].icon}
                    {ROLE_CONFIG[inviteRole].label}
                  </div>
                  {inviteRole === 'management' && 'Full access: applications, pipeline, staff, and dispatch overview.'}
                  {inviteRole === 'onboarding_staff' && 'Manage operator pipeline, onboarding status, and documents.'}
                  {inviteRole === 'dispatcher' && 'Manage active dispatch statuses and load assignments.'}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowInvite(false)}
                  disabled={inviting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="flex-1 bg-surface-dark text-surface-dark-foreground hover:bg-surface-dark/90 gap-1.5"
                  disabled={inviting || !inviteEmail.trim()}
                >
                  {inviting ? (
                    <>
                      <RefreshCcw className="h-4 w-4 animate-spin" />
                      Sending…
                    </>
                  ) : (
                    <>
                      <Mail className="h-4 w-4" />
                      Send Invitation
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
