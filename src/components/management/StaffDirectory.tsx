import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  UserPlus, RefreshCcw, Mail, Shield, Truck, Users,
  Search, Clock, Settings2, AlertTriangle,
} from 'lucide-react';
import DemoLockIcon from '@/components/DemoLockIcon';
import StaffInviteModal from './staff-directory/StaffInviteModal';
import StaffMemberPanel from './staff-directory/StaffMemberPanel';
import {
  ALL_STAFF_ROLES, ROLE_CONFIG, STATUS_CONFIG,
  type AppRole, type StaffMember, type StaffRole,
} from './staff-directory/types';

export default function StaffDirectory() {
  const { session, user, isOwner, signOut } = useAuth();
  const { toast } = useToast();

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery, 200);
  const [roleFilter, setRoleFilter] = useState<StaffRole | 'all'>('all');
  const [showInvite, setShowInvite] = useState(false);
  const [managingMember, setManagingMember] = useState<StaffMember | null>(null);

  const fetchStaff = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('get-staff-list', {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });

      if (error) {
        const status = (error as any)?.context?.status ?? (error as any)?.status;
        const msg = (error as any)?.message ?? '';
        if (status === 401 || /non-2xx/i.test(msg)) {
          await signOut();
          return;
        }
        throw error;
      }
      if (data?.error) throw new Error(data.error);

      setStaff(data.staff ?? []);
    } catch (err) {
      console.error('fetchStaff error:', err);
      toast({
        title: 'Failed to load staff',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [session?.access_token, signOut, toast]);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  const handleMemberChange = (updated: StaffMember) => {
    setStaff(prev => prev.map(m => m.user_id === updated.user_id ? updated : m));
    setManagingMember(prev => prev && prev.user_id === updated.user_id ? updated : prev);
  };

  const handleMemberDeleted = (userId: string) => {
    setStaff(prev => prev.filter(m => m.user_id !== userId));
    setManagingMember(null);
  };

  const filteredStaff = staff.filter(s => {
    const matchesRole = roleFilter === 'all' || s.roles.includes(roleFilter as AppRole);
    if (!matchesRole) return false;
    if (!debouncedSearch) return true;
    const q = debouncedSearch.toLowerCase();
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
    const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
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
          <Button
            size="sm"
            onClick={() => setShowInvite(true)}
            className="gap-1.5 bg-surface-dark text-surface-dark-foreground hover:bg-surface-dark/90"
          >
            <DemoLockIcon />
            <UserPlus className="h-4 w-4" />
            Invite Staff Member
          </Button>
        </div>
      </div>

      {/* Role stat pills */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { key: 'all', label: 'All Staff', icon: <Users className="h-4 w-4" />, color: 'bg-secondary' },
          { key: 'management', label: 'Management', icon: <Shield className="h-4 w-4 text-gold" />, color: 'bg-gold/10' },
          { key: 'onboarding_staff', label: 'Onboarding', icon: <Users className="h-4 w-4 text-status-complete" />, color: 'bg-status-complete/10' },
          { key: 'dispatcher', label: 'Dispatchers', icon: <Truck className="h-4 w-4 text-blue-500" />, color: 'bg-blue-500/10' },
        ].map(item => (
          <button
            key={item.key}
            onClick={() => setRoleFilter(item.key as StaffRole | 'all')}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left ${
              roleFilter === item.key
                ? 'border-surface-dark shadow-sm bg-white ring-1 ring-surface-dark/20'
                : 'border-border bg-white hover:bg-secondary/40'
            }`}
          >
            <div className={`h-8 w-8 rounded-lg ${item.color} flex items-center justify-center shrink-0`}>
              {item.icon}
            </div>
            <div>
              <p className="text-xl font-bold text-foreground leading-none">{counts[item.key as keyof typeof counts]}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{item.label}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search by name or email…"
          className="w-full pl-9 pr-4 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gold/30"
        />
      </div>

      {/* Staff Table */}
      <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-muted-foreground text-sm">Loading staff…</div>
        ) : filteredStaff.length === 0 ? (
          <div className="py-16 text-center">
            <Users className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">
              {staff.length === 0
                ? 'No staff members found. Invite your first team member!'
                : 'No staff members match the current filter.'}
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
              <span className="col-span-3">Name</span>
              <span className="col-span-3">Email</span>
              <span className="col-span-2">Roles</span>
              <span className="col-span-1 text-center">Operators</span>
              <span className="col-span-2">Status · Joined</span>
              <span className="col-span-1 text-right">Access</span>
            </div>

            <div className="divide-y divide-border">
              {filteredStaff.map(member => {
                const name = [member.first_name, member.last_name].filter(Boolean).join(' ') || '(No name set)';
                const statusCfg = STATUS_CONFIG[member.account_status] ?? STATUS_CONFIG.pending;
                const initial = (member.first_name?.[0] ?? member.last_name?.[0] ?? '?').toUpperCase();

                return (
                  <div key={member.user_id} className="grid grid-cols-12 items-center px-5 py-4 hover:bg-secondary/20 transition-colors">
                    {/* Name + avatar */}
                    <div className="col-span-3">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full overflow-hidden border border-border/60 shrink-0 flex items-center justify-center bg-surface-dark">
                          {member.avatar_url ? (
                            <img src={member.avatar_url} alt={name} className="h-full w-full object-cover" />
                          ) : (
                            <span className="text-sm font-semibold text-gold">{initial}</span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{name}</p>
                          <p className="text-xs text-muted-foreground">
                            {member.user_id === user?.id ? (
                              <span className="text-gold font-medium">You</span>
                            ) : (
                              formatDate(member.created_at)
                            )}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Email */}
                    <div className="col-span-3 min-w-0">
                      {member.email ? (
                        <a
                          href={`mailto:${member.email}`}
                          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-gold transition-colors truncate"
                          onClick={e => e.stopPropagation()}
                        >
                          <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                          <span className="truncate">{member.email}</span>
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground/50">—</span>
                      )}
                    </div>

                    {/* Roles */}
                    <div className="col-span-2 flex flex-wrap gap-1">
                      {member.roles.includes('owner') && (
                        <Badge className="text-xs border gap-1 bg-amber-500/15 text-amber-600 border-amber-400/30">
                          <Shield className="h-3 w-3" />
                          <span className="hidden lg:inline">Owner</span>
                        </Badge>
                      )}
                      {member.roles
                        .filter(r => ALL_STAFF_ROLES.includes(r as StaffRole))
                        .map(r => {
                          const cfg = ROLE_CONFIG[r as StaffRole];
                          return (
                            <Badge key={r} className={`text-xs border gap-1 ${cfg.color}`}>
                              {cfg.icon}
                              <span className="hidden lg:inline">{cfg.label}</span>
                            </Badge>
                          );
                        })}
                    </div>

                    {/* Operator count */}
                    <div className="col-span-1 text-center">
                      {member.roles.includes('onboarding_staff') || member.roles.includes('management') ? (
                        <span className={`inline-flex items-center justify-center h-6 min-w-[1.5rem] px-1.5 rounded-full text-xs font-bold ${
                          member.assigned_operator_count > 0
                            ? 'bg-gold/15 text-gold-muted'
                            : 'bg-secondary text-muted-foreground'
                        }`}>
                          {member.assigned_operator_count}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground/40">—</span>
                      )}
                    </div>

                    {/* Status + joined */}
                    <div className="col-span-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge className={`text-xs border ${statusCfg.color}`}>
                          {statusCfg.label}
                        </Badge>
                        {member.account_status === 'inactive' && (
                          <Badge className="text-xs border bg-warning/15 text-warning border-warning/40 gap-1">
                            <AlertTriangle className="h-2.5 w-2.5" />
                            Suspended
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                        <Clock className="h-3 w-3 shrink-0" />
                        {formatDate(member.created_at)}
                      </div>
                    </div>

                    {/* Manage access */}
                    <div className="col-span-1 flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                        onClick={() => setManagingMember(member)}
                        title="Manage access"
                      >
                        <Settings2 className="h-4 w-4" />
                      </Button>
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

      {/* Manage Access Modal */}
      {managingMember && (
        <StaffMemberPanel
          member={managingMember}
          currentUserId={user?.id}
          isOwner={isOwner}
          accessToken={session?.access_token}
          onClose={() => setManagingMember(null)}
          onMemberChange={handleMemberChange}
          onMemberDeleted={handleMemberDeleted}
        />
      )}

      {/* Invite Modal */}
      <StaffInviteModal
        open={showInvite}
        accessToken={session?.access_token}
        onClose={() => setShowInvite(false)}
        onInvited={fetchStaff}
      />
    </div>
  );
}