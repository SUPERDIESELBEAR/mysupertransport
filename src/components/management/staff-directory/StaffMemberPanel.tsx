import { useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useDemoMode } from '@/hooks/useDemoMode';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  RefreshCcw, Mail, X, Plus, Minus, AlertTriangle, CheckCircle2,
  Phone, Trash2, Camera, Loader2, KeyRound,
} from 'lucide-react';
import { formatPhoneInput } from '@/lib/utils';
import { ALL_STAFF_ROLES, ROLE_CONFIG, STATUS_CONFIG, type AppRole, type StaffMember, type StaffRole } from './types';

interface StaffMemberPanelProps {
  member: StaffMember;
  currentUserId: string | undefined;
  isOwner: boolean;
  accessToken: string | undefined;
  onClose: () => void;
  onMemberChange: (updated: StaffMember) => void;
  onMemberDeleted: (userId: string) => void;
}

export default function StaffMemberPanel({
  member, currentUserId, isOwner, accessToken, onClose, onMemberChange, onMemberDeleted,
}: StaffMemberPanelProps) {
  const { toast } = useToast();
  const { guardDemo } = useDemoMode();

  const [roleActionLoading, setRoleActionLoading] = useState<string | null>(null);
  const [editingPhone, setEditingPhone] = useState(member.phone ?? '');
  const [phoneEditActive, setPhoneEditActive] = useState(false);
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [editingFirstName, setEditingFirstName] = useState(member.first_name ?? '');
  const [editingLastName, setEditingLastName] = useState(member.last_name ?? '');
  const [nameEditActive, setNameEditActive] = useState(false);
  const [nameSaving, setNameSaving] = useState(false);
  const [editingEmail, setEditingEmail] = useState(member.email ?? '');
  const [emailEditActive, setEmailEditActive] = useState(false);
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailConfirmPending, setEmailConfirmPending] = useState(false);
  const [deleteConfirmPending, setDeleteConfirmPending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [resetConfirmPending, setResetConfirmPending] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const avatarFileInputRef = useRef<HTMLInputElement>(null);

  const memberName = [member.first_name, member.last_name].filter(Boolean).join(' ')
    || member.email || member.user_id;

  const authHeaders = { Authorization: `Bearer ${accessToken}` };

  const closeAll = () => {
    setDeleteConfirmPending(false);
    setResetConfirmPending(false);
    setTogglingStatus(false);
    onClose();
  };

  const handleRoleChange = async (role: StaffRole, action: 'add' | 'remove') => {
    if (guardDemo()) return;
    const key = `${member.user_id}-${role}-${action}`;
    setRoleActionLoading(key);
    try {
      const { data, error } = await supabase.functions.invoke('get-staff-list', {
        method: 'POST',
        body: { action, user_id: member.user_id, role },
        headers: authHeaders,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: action === 'add' ? '✅ Role Added' : 'Role Removed',
        description: `${ROLE_CONFIG[role].label} ${action === 'add' ? 'granted' : 'revoked'} successfully.`,
      });

      const newRoles = action === 'add'
        ? [...member.roles, role as AppRole]
        : member.roles.filter(r => r !== role);
      onMemberChange({ ...member, roles: newRoles });
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
    if (guardDemo()) return;
    setPhoneSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('get-staff-list', {
        method: 'POST',
        body: { action: 'update_phone', user_id: member.user_id, phone: editingPhone, target_name: memberName },
        headers: authHeaders,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const saved = editingPhone.trim() || null;
      onMemberChange({ ...member, phone: saved });
      setPhoneEditActive(false);
      toast({ title: '✅ Phone Updated', description: 'Phone number saved successfully.' });
    } catch (err) {
      toast({ title: 'Update Failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setPhoneSaving(false);
    }
  };

  const handleNameUpdate = async () => {
    if (guardDemo()) return;
    setNameSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('get-staff-list', {
        method: 'POST',
        body: {
          action: 'update_name',
          user_id: member.user_id,
          first_name: editingFirstName,
          last_name: editingLastName,
          target_name: memberName,
        },
        headers: authHeaders,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const savedFirst = editingFirstName.trim() || null;
      const savedLast = editingLastName.trim() || null;
      onMemberChange({ ...member, first_name: savedFirst, last_name: savedLast });
      setNameEditActive(false);
      toast({ title: '✅ Name Updated', description: 'Staff member name saved successfully.' });
    } catch (err) {
      toast({ title: 'Update Failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setNameSaving(false);
    }
  };

  const handleEmailSaveRequest = () => {
    const trimmed = editingEmail.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast({ title: 'Invalid Email', description: 'Please enter a valid email address.', variant: 'destructive' });
      return;
    }
    setEmailConfirmPending(true);
  };

  const handleEmailUpdate = async () => {
    if (guardDemo()) return;
    const trimmed = editingEmail.trim().toLowerCase();
    setEmailSaving(true);
    setEmailConfirmPending(false);
    try {
      const { data, error } = await supabase.functions.invoke('get-staff-list', {
        method: 'POST',
        body: { action: 'update_email', user_id: member.user_id, email: trimmed, target_name: memberName },
        headers: authHeaders,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      onMemberChange({ ...member, email: trimmed });
      setEmailEditActive(false);
      toast({ title: '✅ Email Updated', description: 'Email address saved successfully.' });
    } catch (err) {
      toast({ title: 'Update Failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setEmailSaving(false);
    }
  };

  const handleDeleteMember = async () => {
    if (guardDemo()) return;
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke('delete-user-account', {
        body: { user_id: member.user_id },
        headers: authHeaders,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      onMemberDeleted(member.user_id);
      setDeleteConfirmPending(false);
      toast({ title: '✅ Account Deleted', description: `${memberName} has been permanently deleted.` });
    } catch (err) {
      toast({ title: 'Delete Failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleStatus = async () => {
    if (guardDemo()) return;
    const isActive = member.account_status === 'active';
    const newStatus = isActive ? 'inactive' : 'active';
    const action = isActive ? 'deactivate_user' : 'reactivate_user';
    setTogglingStatus(true);
    try {
      const { data, error } = await supabase.functions.invoke('get-staff-list', {
        method: 'POST',
        body: { action, user_id: member.user_id, target_name: memberName },
        headers: authHeaders,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      onMemberChange({ ...member, account_status: newStatus });
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

  const handleSendPasswordReset = async () => {
    if (guardDemo()) return;
    setSendingReset(true);
    try {
      const { data, error } = await supabase.functions.invoke('get-staff-list', {
        method: 'POST',
        body: { action: 'send_password_reset', user_id: member.user_id, target_name: memberName },
        headers: authHeaders,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: '✅ Reset link sent',
        description: `${memberName} will receive a password reset email at ${member.email}. The link expires in 1 hour.`,
      });
      setResetConfirmPending(false);
    } catch (err) {
      toast({
        title: 'Failed to send reset link',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSendingReset(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
      const path = `${member.user_id}/avatar.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      const { error: dbError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('user_id', member.user_id);
      if (dbError) throw dbError;
      onMemberChange({ ...member, avatar_url: publicUrl });
      toast({ title: 'Photo updated', description: 'Staff member photo has been saved.' });
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setAvatarUploading(false);
      if (avatarFileInputRef.current) avatarFileInputRef.current.value = '';
    }
  };

  const handleAvatarRemove = async () => {
    setAvatarUploading(true);
    setAvatarError(null);
    try {
      const { error: dbError } = await supabase
        .from('profiles')
        .update({ avatar_url: null })
        .eq('user_id', member.user_id);
      if (dbError) throw dbError;
      onMemberChange({ ...member, avatar_url: null });
      toast({ title: 'Photo removed' });
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Remove failed.');
    } finally {
      setAvatarUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeAll} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md animate-scale-in max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-border sticky top-0 bg-white z-10 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full overflow-hidden border border-border/60 shrink-0 flex items-center justify-center bg-surface-dark">
              {member.avatar_url ? (
                <img src={member.avatar_url} alt={[member.first_name, member.last_name].filter(Boolean).join(' ') || 'Staff'} className="h-full w-full object-cover" />
              ) : (
                <span className="text-base font-bold text-gold">
                  {(member.first_name?.[0] ?? member.last_name?.[0] ?? '?').toUpperCase()}
                </span>
              )}
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">
                {[member.first_name, member.last_name].filter(Boolean).join(' ') || '(No name set)'}
              </h2>
              <p className="text-xs text-muted-foreground">{member.email ?? 'No email'}</p>
            </div>
          </div>
          <button onClick={closeAll} className="text-muted-foreground hover:text-foreground transition-colors">
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
              onChange={handleAvatarUpload}
            />
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-full overflow-hidden border-2 border-border shrink-0 flex items-center justify-center bg-surface-dark">
                {member.avatar_url ? (
                  <img src={member.avatar_url} alt="Staff photo" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xl font-bold text-gold">
                    {(member.first_name?.[0] ?? member.last_name?.[0] ?? '?').toUpperCase()}
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
                  {member.avatar_url ? 'Change Photo' : 'Upload Photo'}
                </Button>
                {member.avatar_url && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={avatarUploading}
                    onClick={handleAvatarRemove}
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
                const hasRole = member.roles.includes(role as AppRole);
                const isSelf = member.user_id === currentUserId;
                const cantRemove = isSelf && role === 'management';
                const loadingKey = `${member.user_id}-${role}-${hasRole ? 'remove' : 'add'}`;
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
                          onClick={() => handleRoleChange(role, hasRole ? 'remove' : 'add')}
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
                    onClick={() => { setNameEditActive(false); setEditingFirstName(member.first_name ?? ''); setEditingLastName(member.last_name ?? ''); }}
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
                  {[member.first_name, member.last_name].filter(Boolean).join(' ') || (
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
              {member.roles.includes('dispatcher' as AppRole) && (
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
                  onClick={() => { setPhoneEditActive(false); setEditingPhone(member.phone ?? ''); }}
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
                  {member.phone ? (
                    <span className="text-foreground">{member.phone}</span>
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
                    onClick={() => { setEmailEditActive(false); setEmailConfirmPending(false); setEditingEmail(member.email ?? ''); }}
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
                  {member.email ? (
                    <span className="text-foreground truncate">{member.email}</span>
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
              <Badge className={`text-xs border ${STATUS_CONFIG[member.account_status]?.color ?? ''}`}>
                {STATUS_CONFIG[member.account_status]?.label ?? member.account_status}
              </Badge>
            </div>
            {(member.roles.includes('onboarding_staff') || member.roles.includes('management')) && (
              <div className="flex items-center justify-between text-xs mt-2">
                <span className="text-muted-foreground">Assigned operators</span>
                <span className="font-semibold text-foreground">{member.assigned_operator_count}</span>
              </div>
            )}
          </div>

          {/* ── Account Recovery: Send Password Reset Link ── */}
          {member.user_id !== currentUserId && !member.roles.includes('owner') && member.email && (
            <div className="pt-1 border-t border-border/60 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Account Recovery</p>
              {!resetConfirmPending ? (
                <button
                  type="button"
                  onClick={() => setResetConfirmPending(true)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-dashed border-primary/40 bg-primary/5 text-foreground hover:bg-primary/10 transition-colors group"
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <KeyRound className="h-4 w-4 shrink-0 text-primary" />
                    Send Password Reset Link
                  </div>
                  <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">1-hour link via email</span>
                </button>
              ) : (
                <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-3 space-y-3">
                  <div className="flex items-start gap-2">
                    <KeyRound className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <div className="text-xs text-foreground leading-relaxed">
                      <p className="font-semibold mb-0.5">Email a password reset link?</p>
                      <p className="text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {[member.first_name, member.last_name].filter(Boolean).join(' ') || member.email}
                        </span>
                        {' '}will receive a recovery email at{' '}
                        <span className="font-medium text-foreground">{member.email}</span>.
                        The link expires in 1 hour.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={sendingReset}
                      onClick={() => setResetConfirmPending(false)}
                      className="flex-1 h-8 text-xs"
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      disabled={sendingReset}
                      onClick={handleSendPasswordReset}
                      className="flex-1 h-8 text-xs gap-1"
                    >
                      {sendingReset
                        ? <RefreshCcw className="h-3 w-3 animate-spin" />
                        : <Mail className="h-3 w-3" />}
                      {sendingReset ? 'Sending…' : 'Yes, Send Link'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Danger Zone: Deactivate + Delete ── */}
          {member.user_id !== currentUserId && !member.roles.includes('owner') && (
            <div className="pt-1 border-t border-destructive/20 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Danger Zone</p>

              {/* Deactivate / Reactivate toggle */}
              {member.account_status === 'active' ? (
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
                          {[member.first_name, member.last_name].filter(Boolean).join(' ') || member.email}
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
            onClick={closeAll}
          >
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}