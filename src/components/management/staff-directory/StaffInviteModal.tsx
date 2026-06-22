import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useDemoMode } from '@/hooks/useDemoMode';
import { Button } from '@/components/ui/button';
import { UserPlus, RefreshCcw, Mail, X, ChevronDown, Phone } from 'lucide-react';
import { formatPhoneInput } from '@/lib/utils';
import { ROLE_CONFIG, type StaffRole } from './types';

interface StaffInviteModalProps {
  open: boolean;
  accessToken: string | undefined;
  onClose: () => void;
  onInvited: () => void | Promise<void>;
}

export default function StaffInviteModal({ open, accessToken, onClose, onInvited }: StaffInviteModalProps) {
  const { toast } = useToast();
  const { guardDemo } = useDemoMode();

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteFirstName, setInviteFirstName] = useState('');
  const [inviteLastName, setInviteLastName] = useState('');
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteRole, setInviteRole] = useState<StaffRole>('onboarding_staff');
  const [inviting, setInviting] = useState(false);
  const [inviteMode, setInviteMode] = useState<'invite' | 'manual'>('invite');
  const [invitePassword, setInvitePassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const reset = () => {
    setInviteEmail('');
    setInviteFirstName('');
    setInviteLastName('');
    setInvitePhone('');
    setInviteRole('onboarding_staff');
    setInviteMode('invite');
    setInvitePassword('');
    setShowPassword(false);
  };

  const handleClose = () => {
    onClose();
  };

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
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: inviteMode === 'manual' ? '✅ Staff Member Created' : '✅ Invitation Sent',
        description: inviteMode === 'manual'
          ? `${inviteEmail} has been added as ${ROLE_CONFIG[inviteRole].label}. Share the temporary password with them.`
          : `${inviteEmail} has been invited as ${ROLE_CONFIG[inviteRole].label}.`,
      });
      reset();
      onClose();
      await onInvited();
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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />
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
          <button onClick={handleClose} className="text-muted-foreground hover:text-foreground transition-colors">
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
            <Button type="button" variant="outline" className="flex-1" onClick={handleClose} disabled={inviting}>
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
  );
}