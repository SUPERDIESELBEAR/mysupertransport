import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useDemoMode } from '@/hooks/useDemoMode';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  UserPlus, RefreshCcw, Mail, Shield, Truck, Users,
  Search, X, ChevronDown, Clock, Settings2, Plus, Minus,
  AlertTriangle, CheckCircle2, Phone, Trash2, Camera, Loader2, KeyRound
} from 'lucide-react';
import DemoLockIcon from '@/components/DemoLockIcon';
import { formatPhoneInput } from '@/lib/utils';
import type { Database } from '@/integrations/supabase/types';

type AppRole = Database['public']['Enums']['app_role'];
type StaffRole = 'onboarding_staff' | 'dispatcher' | 'management';

interface StaffMember {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  account_status: string;
  created_at: string;
  updated_at: string;
  roles: AppRole[];
  assigned_operator_count: number;
  avatar_url?: string | null;
}

const ROLE_CONFIG: Record<StaffRole, { label: string; icon: React.ReactNode; color: string; desc: string }> = {
  management: {
    label: 'Management',
    icon: <Shield className="h-3 w-3" />,
    color: 'bg-gold/15 text-gold-muted border-gold/30',
    desc: 'Full access: applications, pipeline, staff, and dispatch.',
  },
  onboarding_staff: {
    label: 'Onboarding Staff',
    icon: <Users className="h-3 w-3" />,
    color: 'bg-status-complete/15 text-status-complete border-status-complete/30',
    desc: 'Manage operator pipeline, onboarding status, and documents.',
  },
  dispatcher: {
    label: 'Dispatcher',
    icon: <Truck className="h-3 w-3" />,
    color: 'bg-blue-500/15 text-blue-600 border-blue-300',
    desc: 'Manage active dispatch statuses and load assignments.',
  },
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  active: { label: 'Active', color: 'bg-status-complete/15 text-status-complete border-status-complete/30' },
  pending: { label: 'Pending', color: 'bg-status-in-progress/15 text-status-in-progress border-status-in-progress/30' },
  inactive: { label: 'Inactive', color: 'bg-muted text-muted-foreground border-border' },
  denied: { label: 'Denied', color: 'bg-destructive/15 text-destructive border-destructive/30' },
};

const ALL_STAFF_ROLES: StaffRole[] = ['onboarding_staff', 'dispatcher', 'management'];

export default function StaffDirectory() {
  const { session, user, isOwner } = useAuth();
  const { toast } = useToast();
  const { guardDemo } = useDemoMode();

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<StaffRole | 'all'>('all');

  // Invite modal
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteFirstName, setInviteFirstName] = useState('');
  const [inviteLastName, setInviteLastName] = useState('');
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteRole, setInviteRole] = useState<StaffRole>('onboarding_staff');
  const [inviting, setInviting] = useState(false);
  const [inviteMode, setInviteMode] = useState<'invite' | 'manual'>('invite');
  const [invitePassword, setInvitePassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Manage access panel
  const [managingMember, setManagingMember] = useState<StaffMember | null>(null);
  const [roleActionLoading, setRoleActionLoading] = useState<string | null>(null);
  const [editingPhone, setEditingPhone] = useState('');
  const [phoneEditActive, setPhoneEditActive] = useState(false);
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [editingFirstName, setEditingFirstName] = useState('');
  const [editingLastName, setEditingLastName] = useState('');
  const [nameEditActive, setNameEditActive] = useState(false);
  const [nameSaving, setNameSaving] = useState(false);
  const [editingEmail, setEditingEmail] = useState('');
  const [emailEditActive, setEmailEditActive] = useState(false);
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailConfirmPending, setEmailConfirmPending] = useState(false);
  const [deleteConfirmPending, setDeleteConfirmPending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState(false);
  // Avatar upload for managed staff member
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const avatarFileInputRef = useRef<HTMLInputElement>(null);

  const fetchStaff = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('get-staff-list', {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });

      if (error) {
        // Detect a 401 from the edge function (stale/revoked session) and force re-login
        const status = (error as any)?.context?.status ?? (error as any)?.status;
        const msg = (error as any)?.message ?? '';
        if (status === 401 || /non-2xx/i.test(msg)) {
          await supabase.auth.signOut().catch(() => {});
          window.location.href = '/login';
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
  }, [session?.access_token, toast]);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (guardDemo()) return;
    if (!inviteEmail.trim()) return;
    if (inviteMode === 'manual' && invitePassword.length < 8) {
      toast({ title: 'Password too short', description: 'Password must be at least 8 characters.', variant: 'destructive' });
      return;
    }
    setInviting(true);
    try {
      const { data, error } = await supabase.functions.invoke('invite-staff', {
        body: {
          email: inviteEmail.trim().toLowerCase(),
          role: inviteRole,
          first_name: inviteFirstName.trim() || undefined,
          last_name: inviteLastName.trim() || undefined,
          phone: invitePhone.trim() || undefined,
          ...(inviteMode === 'manual' ? { password: invitePassword } : {}),
        },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: inviteMode === 'manual' ? '✅ Staff Member Created' : '✅ Invitation Sent',
        description: inviteMode === 'manual'
          ? `${inviteEmail} has been added as ${ROLE_CONFIG[inviteRole].label}. Share the temporary password with them.`
          : `${inviteEmail} has been invited as ${ROLE_CONFIG[inviteRole].label}.`,
      });
      setShowInvite(false);
      setInviteEmail('');
      setInviteFirstName('');
      setInviteLastName('');
      setInvitePhone('');
      setInviteRole('onboarding_staff');
      setInviteMode('invite');
      setInvitePassword('');
      setShowPassword(false);
      await fetchStaff();
    } catch (err) {
      toast({
        title: inviteMode === 'manual' ? 'Creation Failed' : 'Invite Failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (memberId: string, role: StaffRole, action: 'add' | 'remove') => {
    if (guardDemo()) return;
    const key = `${memberId}-${role}-${action}`;
    setRoleActionLoading(key);
    try {
      const { data, error } = await supabase.functions.invoke('get-staff-list', {
        method: 'POST',
        body: { action, user_id: memberId, role },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: action === 'add' ? '✅ Role Added' : 'Role Removed',
        description: `${ROLE_CONFIG[role].label} ${action === 'add' ? 'granted' : 'revoked'} successfully.`,
      });

      // Update local state optimistically for managing panel
      setStaff(prev => prev.map(m => {
        if (m.user_id !== memberId) return m;
        const newRoles = action === 'add'
          ? [...m.roles, role as AppRole]
          : m.roles.filter(r => r !== role);
        return { ...m, roles: newRoles };
      }));

      // Also update managingMember in place
      setManagingMember(prev => {
        if (!prev || prev.user_id !== memberId) return prev;
        const newRoles = action === 'add'
          ? [...prev.roles, role as AppRole]
          : prev.roles.filter(r => r !== role);
        return { ...prev, roles: newRoles };
      });
    } catch (err) {
      toast({
        title: 'Role Update Failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setRoleActionLoading(null);
    }
  };

  const handlePhoneUpdate = async () => {
    if (!managingMember) return;
    if (guardDemo()) return;
    setPhoneSaving(true);
    try {
      const memberName = [managingMember.first_name, managingMember.last_name].filter(Boolean).join(' ') || managingMember.email || managingMember.user_id;
      const { data, error } = await supabase.functions.invoke('get-staff-list', {
        method: 'POST',
        body: { action: 'update_phone', user_id: managingMember.user_id, phone: editingPhone, target_name: memberName },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const saved = editingPhone.trim() || null;
      setManagingMember(prev => prev ? { ...prev, phone: saved } : prev);
      setStaff(prev => prev.map(m => m.user_id === managingMember.user_id ? { ...m, phone: saved } : m));
      setPhoneEditActive(false);
      toast({ title: '✅ Phone Updated', description: 'Phone number saved successfully.' });
    } catch (err) {
      toast({ title: 'Update Failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setPhoneSaving(false);
    }
  };

  const handleNameUpdate = async () => {
    if (!managingMember) return;
    if (guardDemo()) return;
    setNameSaving(true);
    try {
      const memberName = [managingMember.first_name, managingMember.last_name].filter(Boolean).join(' ') || managingMember.email || managingMember.user_id;
      const { data, error } = await supabase.functions.invoke('get-staff-list', {
        method: 'POST',
        body: {
          action: 'update_name',
          user_id: managingMember.user_id,
          first_name: editingFirstName,
          last_name: editingLastName,
          target_name: memberName,
        },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const savedFirst = editingFirstName.trim() || null;
      const savedLast = editingLastName.trim() || null;
      setManagingMember(prev => prev ? { ...prev, first_name: savedFirst, last_name: savedLast } : prev);
      setStaff(prev => prev.map(m => m.user_id === managingMember.user_id ? { ...m, first_name: savedFirst, last_name: savedLast } : m));
      setNameEditActive(false);
      toast({ title: '✅ Name Updated', description: 'Staff member name saved successfully.' });
    } catch (err) {
      toast({ title: 'Update Failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setNameSaving(false);
    }
  };

  const handleEmailSaveRequest = () => {
    if (!managingMember) return;
    const trimmed = editingEmail.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast({ title: 'Invalid Email', description: 'Please enter a valid email address.', variant: 'destructive' });
      return;
    }
    setEmailConfirmPending(true);
  };

  const handleEmailUpdate = async () => {
    if (!managingMember) return;
    if (guardDemo()) return;
    const trimmed = editingEmail.trim().toLowerCase();
    setEmailSaving(true);
    setEmailConfirmPending(false);
    try {
      const memberName = [managingMember.first_name, managingMember.last_name].filter(Boolean).join(' ') || managingMember.email || managingMember.user_id;
      const { data, error } = await supabase.functions.invoke('get-staff-list', {
        method: 'POST',
        body: { action: 'update_email', user_id: managingMember.user_id, email: trimmed, target_name: memberName },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setManagingMember(prev => prev ? { ...prev, email: trimmed } : prev);
      setStaff(prev => prev.map(m => m.user_id === managingMember.user_id ? { ...m, email: trimmed } : m));
      setEmailEditActive(false);
      toast({ title: '✅ Email Updated', description: 'Email address saved successfully.' });
    } catch (err) {
      toast({ title: 'Update Failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setEmailSaving(false);
    }
  };

  const handleDeleteMember = async () => {
    if (!managingMember) return;
    if (guardDemo()) return;
    setDeleting(true);
    try {
      const memberName = [managingMember.first_name, managingMember.last_name].filter(Boolean).join(' ') || managingMember.email || managingMember.user_id;
      
      // Use the owner-only delete-user-account edge function
      const { data, error } = await supabase.functions.invoke('delete-user-account', {
        body: { user_id: managingMember.user_id },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setStaff(prev => prev.filter(m => m.user_id !== managingMember.user_id));
      setManagingMember(null);
      setDeleteConfirmPending(false);
      toast({ title: '✅ Account Deleted', description: `${memberName} has been permanently deleted.` });
    } catch (err) {
      toast({ title: 'Delete Failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!managingMember) return;
    if (guardDemo()) return;
    const isActive = managingMember.account_status === 'active';
    const newStatus = isActive ? 'inactive' : 'active';
    const action = isActive ? 'deactivate_user' : 'reactivate_user';
    setTogglingStatus(true);
    try {
      const memberName = [managingMember.first_name, managingMember.last_name].filter(Boolean).join(' ') || managingMember.email || managingMember.user_id;
      const { data, error } = await supabase.functions.invoke('get-staff-list', {
        method: 'POST',
        body: { action, user_id: managingMember.user_id, target_name: memberName },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setManagingMember(prev => prev ? { ...prev, account_status: newStatus } : prev);
      setStaff(prev => prev.map(m => m.user_id === managingMember.user_id ? { ...m, account_status: newStatus } : m));
      toast({
        title: isActive ? 'Account Suspended' : '✅ Account Reactivated',
        description: isActive
          ? `${memberName} has been suspended and can no longer log in.`
          : `${memberName} can now log in again.`,
      });
    } catch (err) {
      toast({ title: isActive ? 'Deactivation Failed' : 'Reactivation Failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setTogglingStatus(false);
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
                          onClick={() => { setManagingMember(member); setEditingPhone(member.phone ?? ''); setPhoneEditActive(false); setEditingFirstName(member.first_name ?? ''); setEditingLastName(member.last_name ?? ''); setNameEditActive(false); setEditingEmail(member.email ?? ''); setEmailEditActive(false); }}
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

      {/* ── Manage Access Modal ── */}
      {managingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { setManagingMember(null); setDeleteConfirmPending(false); }} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md animate-scale-in max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-border sticky top-0 bg-white z-10 rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full overflow-hidden border border-border/60 shrink-0 flex items-center justify-center bg-surface-dark">
                  {managingMember.avatar_url ? (
                    <img src={managingMember.avatar_url} alt={[managingMember.first_name, managingMember.last_name].filter(Boolean).join(' ') || 'Staff'} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-base font-bold text-gold">
                      {(managingMember.first_name?.[0] ?? managingMember.last_name?.[0] ?? '?').toUpperCase()}
                    </span>
                  )}
                </div>
                <div>
                  <h2 className="text-base font-bold text-foreground">
                    {[managingMember.first_name, managingMember.last_name].filter(Boolean).join(' ') || '(No name set)'}
                  </h2>
                  <p className="text-xs text-muted-foreground">{managingMember.email ?? 'No email'}</p>
                </div>
              </div>
              <button onClick={() => { setManagingMember(null); setDeleteConfirmPending(false); }} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">

              {/* ── Profile Photo ── */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Profile Photo</p>
                <input
                  ref={avatarFileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setAvatarError(null);
                    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
                      setAvatarError('Please upload a JPEG, PNG, or WebP image.');
                      return;
                    }
                    if (file.size > 5 * 1024 * 1024) {
                      setAvatarError('Image must be under 5 MB.');
                      return;
                    }
                    setAvatarUploading(true);
                    try {
                      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
                      const path = `${managingMember.user_id}/avatar.${ext}`;
                      const { error: uploadError } = await supabase.storage
                        .from('avatars')
                        .upload(path, file, { upsert: true, contentType: file.type });
                      if (uploadError) throw uploadError;
                      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
                      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;
                      const { error: dbError } = await supabase
                        .from('profiles')
                        .update({ avatar_url: publicUrl })
                        .eq('user_id', managingMember.user_id);
                      if (dbError) throw dbError;
                      setManagingMember(prev => prev ? { ...prev, avatar_url: publicUrl } : prev);
                      setStaff(prev => prev.map(m => m.user_id === managingMember.user_id ? { ...m, avatar_url: publicUrl } : m));
                      toast({ title: 'Photo updated', description: 'Staff member photo has been saved.' });
                    } catch (err) {
                      setAvatarError(err instanceof Error ? err.message : 'Upload failed.');
                    } finally {
                      setAvatarUploading(false);
                      if (avatarFileInputRef.current) avatarFileInputRef.current.value = '';
                    }
                  }}
                />
                <div className="flex items-center gap-4">
                  {/* Avatar preview */}
                  <div className="h-16 w-16 rounded-full overflow-hidden border-2 border-border shrink-0 flex items-center justify-center bg-surface-dark">
                    {managingMember.avatar_url ? (
                      <img src={managingMember.avatar_url} alt="Staff photo" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-xl font-bold text-gold">
                        {(managingMember.first_name?.[0] ?? managingMember.last_name?.[0] ?? '?').toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={avatarUploading}
                      onClick={() => avatarFileInputRef.current?.click()}
                      className="h-8 px-3 text-xs gap-1.5"
                    >
                      {avatarUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                      {managingMember.avatar_url ? 'Change Photo' : 'Upload Photo'}
                    </Button>
                    {managingMember.avatar_url && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={avatarUploading}
                        onClick={async () => {
                          setAvatarUploading(true);
                          setAvatarError(null);
                          try {
                            const { error: dbError } = await supabase
                              .from('profiles')
                              .update({ avatar_url: null })
                              .eq('user_id', managingMember.user_id);
                            if (dbError) throw dbError;
                            setManagingMember(prev => prev ? { ...prev, avatar_url: null } : prev);
                            setStaff(prev => prev.map(m => m.user_id === managingMember.user_id ? { ...m, avatar_url: null } : m));
                            toast({ title: 'Photo removed' });
                          } catch (err) {
                            setAvatarError(err instanceof Error ? err.message : 'Remove failed.');
                          } finally {
                            setAvatarUploading(false);
                          }
                        }}
                        className="h-8 px-3 text-xs gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
                      >
                        <X className="h-3.5 w-3.5" />
                        Remove Photo
                      </Button>
                    )}
                  </div>
                </div>
                {avatarError && <p className="text-xs text-destructive mt-2">{avatarError}</p>}
              </div>

              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Role Access</p>
                <div className="space-y-2">
                  {ALL_STAFF_ROLES.map(role => {
                    const cfg = ROLE_CONFIG[role];
                    const hasRole = managingMember.roles.includes(role as AppRole);
                    const isSelf = managingMember.user_id === user?.id;
                    const cantRemove = isSelf && role === 'management';
                    const loadingKey = `${managingMember.user_id}-${role}-${hasRole ? 'remove' : 'add'}`;
                    const isLoading = roleActionLoading === loadingKey;

                    return (
                      <div
                        key={role}
                        className={`flex items-center justify-between p-3 rounded-xl border transition-colors ${
                          hasRole ? 'bg-secondary/40 border-border' : 'bg-white border-border'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${cfg.color}`}>
                            {cfg.icon}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">{cfg.label}</p>
                            <p className="text-xs text-muted-foreground">{cfg.desc}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          {hasRole && (
                            <span className="flex items-center gap-1 text-xs text-status-complete">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Active
                            </span>
                          )}
                          {cantRemove ? (
                            <span className="text-xs text-muted-foreground/50 flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" /> Protected
                            </span>
                          ) : (
                            <Button
                              size="sm"
                              variant={hasRole ? 'outline' : 'default'}
                              disabled={isLoading}
                              onClick={() => handleRoleChange(managingMember.user_id, role, hasRole ? 'remove' : 'add')}
                              className={`h-7 px-2.5 text-xs gap-1 ${
                                hasRole
                                  ? 'text-destructive border-destructive/30 hover:bg-destructive/10'
                                  : 'bg-surface-dark text-surface-dark-foreground hover:bg-surface-dark/90'
                              }`}
                            >
                              {isLoading ? (
                                <RefreshCcw className="h-3 w-3 animate-spin" />
                              ) : hasRole ? (
                                <><Minus className="h-3 w-3" /> Remove</>
                              ) : (
                                <><Plus className="h-3 w-3" /> Grant</>
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Name editing */}
              <div className="pt-1 border-t border-border">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Name</p>
                </div>
                {nameEditActive ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={editingFirstName}
                        onChange={e => setEditingFirstName(e.target.value)}
                        placeholder="First name"
                        maxLength={100}
                        autoFocus
                        className="w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gold/30"
                      />
                      <input
                        type="text"
                        value={editingLastName}
                        onChange={e => setEditingLastName(e.target.value)}
                        placeholder="Last name"
                        maxLength={100}
                        className="w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gold/30"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={nameSaving}
                        onClick={handleNameUpdate}
                        className="h-8 px-3 text-xs bg-surface-dark text-surface-dark-foreground hover:bg-surface-dark/90 gap-1"
                      >
                        {nameSaving ? <RefreshCcw className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={nameSaving}
                        onClick={() => { setNameEditActive(false); setEditingFirstName(managingMember.first_name ?? ''); setEditingLastName(managingMember.last_name ?? ''); }}
                        className="h-8 px-3 text-xs"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="flex items-center justify-between px-3 py-2 rounded-lg border border-dashed border-border bg-secondary/30 cursor-pointer hover:bg-secondary/50 transition-colors group"
                    onClick={() => setNameEditActive(true)}
                  >
                    <span className="text-sm text-foreground">
                      {[managingMember.first_name, managingMember.last_name].filter(Boolean).join(' ') || (
                        <span className="text-muted-foreground/60 italic">No name set</span>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground/50 group-hover:text-muted-foreground transition-colors">Edit</span>
                  </div>
                )}
              </div>

              {/* Phone number */}

              <div className="pt-1 border-t border-border">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Phone Number</p>
                  {managingMember.roles.includes('dispatcher' as AppRole) && (
                    <span className="text-[10px] bg-blue-500/15 text-blue-600 border border-blue-300 px-1.5 py-0.5 rounded-full">
                      Shown in Truck Down alerts
                    </span>
                  )}
                </div>
                {phoneEditActive ? (
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                      <input
                        type="tel"
                        value={editingPhone}
                        onChange={e => setEditingPhone(formatPhoneInput(e.target.value))}
                        placeholder="(555) 000-0000"
                        maxLength={30}
                        autoFocus
                        className="w-full pl-8 pr-3 py-1.5 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gold/30"
                      />
                    </div>
                    <Button
                      size="sm"
                      disabled={phoneSaving}
                      onClick={handlePhoneUpdate}
                      className="h-8 px-3 text-xs bg-surface-dark text-surface-dark-foreground hover:bg-surface-dark/90 gap-1"
                    >
                      {phoneSaving ? <RefreshCcw className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={phoneSaving}
                      onClick={() => { setPhoneEditActive(false); setEditingPhone(managingMember.phone ?? ''); }}
                      className="h-8 px-3 text-xs"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <div
                    className="flex items-center justify-between px-3 py-2 rounded-lg border border-dashed border-border bg-secondary/30 cursor-pointer hover:bg-secondary/50 transition-colors group"
                    onClick={() => setPhoneEditActive(true)}
                  >
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                      {managingMember.phone ? (
                        <span className="text-foreground">{managingMember.phone}</span>
                      ) : (
                        <span className="text-muted-foreground/60 italic">No phone on file</span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground/50 group-hover:text-muted-foreground transition-colors">Edit</span>
                  </div>
                )}
              </div>

              {/* Email address */}
              <div className="pt-1 border-t border-border">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Email Address</p>
                </div>
                {emailEditActive ? (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                        <input
                          type="email"
                          value={editingEmail}
                          onChange={e => { setEditingEmail(e.target.value); setEmailConfirmPending(false); }}
                          placeholder="email@example.com"
                          maxLength={254}
                          autoFocus
                          className="w-full pl-8 pr-3 py-1.5 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gold/30"
                        />
                      </div>
                      <Button
                        size="sm"
                        disabled={emailSaving}
                        onClick={handleEmailSaveRequest}
                        className="h-8 px-3 text-xs bg-surface-dark text-surface-dark-foreground hover:bg-surface-dark/90 gap-1"
                      >
                        {emailSaving ? <RefreshCcw className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={emailSaving}
                        onClick={() => { setEmailEditActive(false); setEmailConfirmPending(false); setEditingEmail(managingMember.email ?? ''); }}
                        className="h-8 px-3 text-xs"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                    {emailConfirmPending && (
                      <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 space-y-2">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                          <div className="text-xs text-amber-800 leading-relaxed">
                            <p className="font-semibold mb-0.5">Confirm email change</p>
                            <p>
                              This staff member's login email will be changed to{' '}
                              <span className="font-mono font-semibold">{editingEmail.trim().toLowerCase()}</span>.
                              They will need to use this new address to sign in from now on.
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2 justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={emailSaving}
                            onClick={() => setEmailConfirmPending(false)}
                            className="h-7 px-3 text-xs"
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            disabled={emailSaving}
                            onClick={handleEmailUpdate}
                            className="h-7 px-3 text-xs bg-amber-600 hover:bg-amber-700 text-white gap-1"
                          >
                            {emailSaving ? <RefreshCcw className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                            Yes, Update Email
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div
                    className="flex items-center justify-between px-3 py-2 rounded-lg border border-dashed border-border bg-secondary/30 cursor-pointer hover:bg-secondary/50 transition-colors group"
                    onClick={() => setEmailEditActive(true)}
                  >
                    <div className="flex items-center gap-2 text-sm min-w-0">
                      <Mail className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                      {managingMember.email ? (
                        <span className="text-foreground truncate">{managingMember.email}</span>
                      ) : (
                        <span className="text-muted-foreground/60 italic">No email on file</span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground/50 group-hover:text-muted-foreground transition-colors shrink-0 ml-2">Edit</span>
                  </div>
                )}
              </div>

              {/* Account status summary */}
              <div className="pt-1 border-t border-border">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Account status</span>
                  <Badge className={`text-xs border ${STATUS_CONFIG[managingMember.account_status]?.color ?? ''}`}>
                    {STATUS_CONFIG[managingMember.account_status]?.label ?? managingMember.account_status}
                  </Badge>
                </div>
                {(managingMember.roles.includes('onboarding_staff') || managingMember.roles.includes('management')) && (
                  <div className="flex items-center justify-between text-xs mt-2">
                    <span className="text-muted-foreground">Assigned operators</span>
                    <span className="font-semibold text-foreground">{managingMember.assigned_operator_count}</span>
                  </div>
                )}
              </div>

              {/* ── Danger Zone: Deactivate + Delete ── */}
              {managingMember.user_id !== user?.id && !managingMember.roles.includes('owner') && (
                <div className="pt-1 border-t border-destructive/20 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Danger Zone</p>

                  {/* Deactivate / Reactivate toggle */}
                  {managingMember.account_status === 'active' ? (
                    <button
                      type="button"
                      disabled={togglingStatus}
                      onClick={handleToggleStatus}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-dashed border-amber-400/40 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors group disabled:opacity-60"
                    >
                      <div className="flex items-center gap-2 text-sm font-medium">
                        {togglingStatus
                          ? <RefreshCcw className="h-4 w-4 shrink-0 animate-spin" />
                          : <AlertTriangle className="h-4 w-4 shrink-0" />
                        }
                        {togglingStatus ? 'Suspending…' : 'Suspend Account'}
                      </div>
                      <span className="text-xs text-amber-600/70 group-hover:text-amber-700 transition-colors">Blocks login</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={togglingStatus}
                      onClick={handleToggleStatus}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-dashed border-status-complete/40 bg-status-complete/5 text-status-complete hover:bg-status-complete/10 transition-colors group disabled:opacity-60"
                    >
                      <div className="flex items-center gap-2 text-sm font-medium">
                        {togglingStatus
                          ? <RefreshCcw className="h-4 w-4 shrink-0 animate-spin" />
                          : <CheckCircle2 className="h-4 w-4 shrink-0" />
                        }
                        {togglingStatus ? 'Reactivating…' : 'Reactivate Account'}
                      </div>
                      <span className="text-xs text-status-complete/70 group-hover:text-status-complete transition-colors">Restore login</span>
                    </button>
                  )}

                  {/* Delete — owner only */}
                  {isOwner && (
                  <>
                  {!deleteConfirmPending ? (
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmPending(true)}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-dashed border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10 transition-colors group"
                    >
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Trash2 className="h-4 w-4 shrink-0" />
                        Delete Account Permanently
                      </div>
                      <span className="text-xs text-destructive/60 group-hover:text-destructive transition-colors">Owner only</span>
                    </button>
                  ) : (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-3 space-y-3">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                        <div className="text-xs text-destructive leading-relaxed">
                          <p className="font-semibold mb-0.5">This action cannot be undone</p>
                          <p>
                            <span className="font-medium">
                              {[managingMember.first_name, managingMember.last_name].filter(Boolean).join(' ') || managingMember.email}
                            </span>
                            {' '}will be permanently removed from the system, losing all access immediately.
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={deleting}
                          onClick={() => setDeleteConfirmPending(false)}
                          className="flex-1 h-8 text-xs"
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          disabled={deleting}
                          onClick={handleDeleteMember}
                          className="flex-1 h-8 text-xs bg-destructive hover:bg-destructive/90 text-destructive-foreground gap-1"
                        >
                          {deleting ? (
                            <RefreshCcw className="h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="h-3 w-3" />
                          )}
                          {deleting ? 'Deleting…' : 'Yes, Delete'}
                        </Button>
                      </div>
                    </div>
                  )}
                  </>
                  )}
                </div>
              )}
            </div>

            <div className="px-6 pb-5">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => { setManagingMember(null); setDeleteConfirmPending(false); setTogglingStatus(false); }}
              >
                Done
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Invite Modal ── */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowInvite(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md animate-scale-in">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-border">
              <div>
                <h2 className="text-lg font-bold text-foreground">
                  {inviteMode === 'manual' ? 'Add Staff Member' : 'Invite Staff Member'}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {inviteMode === 'manual' ? 'Create an account with a temporary password' : 'Send a role-specific invitation email'}
                </p>
              </div>
              <button onClick={() => setShowInvite(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Mode toggle */}
            <div className="px-6 pt-4">
              <div className="flex rounded-lg border border-border bg-secondary/40 p-0.5 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setInviteMode('invite')}
                  className={`flex-1 py-1.5 px-3 rounded-md transition-all ${inviteMode === 'invite' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  Send Email Invitation
                </button>
                <button
                  type="button"
                  onClick={() => setInviteMode('manual')}
                  className={`flex-1 py-1.5 px-3 rounded-md transition-all ${inviteMode === 'manual' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  Set Temporary Password
                </button>
              </div>
            </div>

            <form onSubmit={handleInvite} className="px-6 py-5 space-y-4">
              {/* Name row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">First Name</label>
                  <input type="text" value={inviteFirstName} onChange={e => setInviteFirstName(e.target.value)} placeholder="Jane"
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gold/30" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Last Name</label>
                  <input type="text" value={inviteLastName} onChange={e => setInviteLastName(e.target.value)} placeholder="Smith"
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gold/30" />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Email Address <span className="text-destructive">*</span>
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <input type="email" required value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                    placeholder="jane@mysupertransport.com"
                    className="w-full pl-9 pr-4 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gold/30" />
                </div>
              </div>

              {/* Temporary password — manual mode only */}
              {inviteMode === 'manual' && (
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                    Temporary Password <span className="text-destructive">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={invitePassword}
                      onChange={e => setInvitePassword(e.target.value)}
                      placeholder="Min. 8 characters"
                      minLength={8}
                      className="w-full px-3 pr-10 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gold/30"
                    />
                    <button type="button" onClick={() => setShowPassword(p => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors text-xs">
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">Share this with the staff member — they can change it after logging in.</p>
                </div>
              )}

              {/* Phone */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Phone Number
                  {inviteRole === 'dispatcher' && (
                    <span className="ml-1.5 text-[10px] bg-blue-500/15 text-blue-600 border border-blue-300 px-1.5 py-0.5 rounded-full">
                      Shown to operators in Truck Down alerts
                    </span>
                  )}
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <input type="tel" value={invitePhone} onChange={e => setInvitePhone(formatPhoneInput(e.target.value))} placeholder="(555) 000-0000"
                    className="w-full pl-9 pr-4 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gold/30" />
                </div>
              </div>

              {/* Role */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Role <span className="text-destructive">*</span>
                </label>
                <div className="relative">
                  <select value={inviteRole} onChange={e => setInviteRole(e.target.value as StaffRole)}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-gold/30 pr-8">
                    <option value="onboarding_staff">Onboarding Staff</option>
                    <option value="dispatcher">Dispatcher</option>
                    <option value="management">Management</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                </div>
                <div className={`mt-2 px-3 py-2 rounded-lg text-xs border ${ROLE_CONFIG[inviteRole].color}`}>
                  <div className="flex items-center gap-1.5 font-medium mb-0.5">
                    {ROLE_CONFIG[inviteRole].icon}
                    {ROLE_CONFIG[inviteRole].label}
                  </div>
                  {ROLE_CONFIG[inviteRole].desc}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setShowInvite(false)} disabled={inviting}>
                  Cancel
                </Button>
                <Button type="submit"
                  className="flex-1 bg-surface-dark text-surface-dark-foreground hover:bg-surface-dark/90 gap-1.5"
                  disabled={inviting || !inviteEmail.trim() || (inviteMode === 'manual' && invitePassword.length < 8)}>
                  {inviting ? (
                    <><RefreshCcw className="h-4 w-4 animate-spin" /> {inviteMode === 'manual' ? 'Creating…' : 'Sending…'}</>
                  ) : inviteMode === 'manual' ? (
                    <><UserPlus className="h-4 w-4" /> Create Account</>
                  ) : (
                    <><Mail className="h-4 w-4" /> Send Invitation</>
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
