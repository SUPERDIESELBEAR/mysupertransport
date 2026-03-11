import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff, KeyRound, CheckCircle2 } from 'lucide-react';

interface ChangePasswordModalProps {
  open: boolean;
  onClose: () => void;
  /** Pass 'dark' for the operator portal's dark-theme dialog */
  variant?: 'default' | 'dark';
}

export default function ChangePasswordModal({ open, onClose, variant = 'default' }: ChangePasswordModalProps) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const isDark = variant === 'dark';

  const reset = () => {
    setNewPassword('');
    setConfirmPassword('');
    setShowNew(false);
    setShowConfirm(false);
    setError(null);
    setSuccess(false);
    setLoading(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setSuccess(true);
    setTimeout(() => handleClose(), 2000);
  };

  // Strength indicator
  const strength = (() => {
    if (!newPassword) return 0;
    let score = 0;
    if (newPassword.length >= 8) score++;
    if (newPassword.length >= 12) score++;
    if (/[A-Z]/.test(newPassword)) score++;
    if (/[0-9]/.test(newPassword)) score++;
    if (/[^A-Za-z0-9]/.test(newPassword)) score++;
    return score;
  })();

  const strengthLabel = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Very Strong'][strength];
  const strengthColor = ['', 'bg-destructive', 'bg-orange-400', 'bg-yellow-400', 'bg-status-complete', 'bg-status-complete'][strength];

  const inputClass = isDark
    ? 'bg-surface-dark border-surface-dark-border text-surface-dark-foreground placeholder:text-surface-dark-muted focus:border-gold focus:ring-gold'
    : '';

  const labelClass = isDark ? 'text-surface-dark-foreground' : 'text-foreground';

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className={`sm:max-w-md ${isDark ? 'bg-surface-dark border-surface-dark-border' : ''}`}>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${isDark ? 'bg-gold/15' : 'bg-primary/10'}`}>
              <KeyRound className={`h-4 w-4 ${isDark ? 'text-gold' : 'text-primary'}`} />
            </div>
            <DialogTitle className={isDark ? 'text-surface-dark-foreground' : ''}>
              Change Password
            </DialogTitle>
          </div>
          <DialogDescription className={isDark ? 'text-surface-dark-muted' : ''}>
            Choose a new password for your account. It must be at least 8 characters.
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="h-12 w-12 rounded-full bg-status-complete/15 flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6 text-status-complete" />
            </div>
            <p className={`text-sm font-medium ${isDark ? 'text-surface-dark-foreground' : 'text-foreground'}`}>
              Password updated successfully!
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            {/* New password */}
            <div className="space-y-1.5">
              <Label htmlFor="new-password" className={labelClass}>New Password</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showNew ? 'text' : 'password'}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  className={`pr-10 ${inputClass}`}
                  required
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className={`absolute right-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-surface-dark-muted hover:text-surface-dark-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {/* Strength meter */}
              {newPassword && (
                <div className="space-y-1">
                  <div className="flex gap-1 h-1">
                    {[1, 2, 3, 4, 5].map(i => (
                      <div
                        key={i}
                        className={`flex-1 rounded-full transition-colors ${i <= strength ? strengthColor : isDark ? 'bg-surface-dark-border' : 'bg-muted'}`}
                      />
                    ))}
                  </div>
                  <p className={`text-xs ${isDark ? 'text-surface-dark-muted' : 'text-muted-foreground'}`}>
                    Strength: <span className="font-medium">{strengthLabel}</span>
                  </p>
                </div>
              )}
            </div>

            {/* Confirm password */}
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password" className={labelClass}>Confirm Password</Label>
              <div className="relative">
                <Input
                  id="confirm-password"
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  className={`pr-10 ${inputClass}`}
                  required
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className={`absolute right-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-surface-dark-muted hover:text-surface-dark-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {confirmPassword && newPassword !== confirmPassword && (
                <p className="text-xs text-destructive">Passwords do not match.</p>
              )}
            </div>

            {error && (
              <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                className={`flex-1 ${isDark ? 'border-surface-dark-border text-surface-dark-muted hover:text-surface-dark-foreground hover:bg-surface-dark-card' : ''}`}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading || !newPassword || !confirmPassword}
                className={`flex-1 ${isDark ? 'bg-gold text-surface-dark hover:bg-gold-light font-semibold' : ''}`}
              >
                {loading ? 'Updating…' : 'Update Password'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
