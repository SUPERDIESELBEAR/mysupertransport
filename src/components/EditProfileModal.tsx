import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UserRound, CheckCircle2 } from 'lucide-react';

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
];

interface EditProfileModalProps {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  /** Pass 'dark' for the operator portal's dark-theme dialog */
  variant?: 'default' | 'dark';
}

export default function EditProfileModal({ open, onClose, onSaved, variant = 'default' }: EditProfileModalProps) {
  const { user, profile } = useAuth();

  const [firstName, setFirstName]   = useState('');
  const [lastName, setLastName]     = useState('');
  const [phone, setPhone]           = useState('');
  const [homeState, setHomeState]   = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [success, setSuccess]       = useState(false);

  const isDark = variant === 'dark';

  // Seed from current profile whenever the modal opens
  useEffect(() => {
    if (open && profile) {
      setFirstName(profile.first_name ?? '');
      setLastName(profile.last_name ?? '');
      setPhone(profile.phone ?? '');
      setHomeState(profile.home_state ?? '');
      setError(null);
      setSuccess(false);
    }
  }, [open, profile]);

  const handleClose = () => {
    setError(null);
    setSuccess(false);
    onClose();
  };

  const formatPhone = (val: string) => {
    // Strip everything except digits
    const digits = val.replace(/\D/g, '').slice(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0,3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhone(formatPhone(e.target.value));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!firstName.trim()) { setError('First name is required.'); return; }
    if (firstName.trim().length > 50) { setError('First name must be 50 characters or less.'); return; }
    if (!lastName.trim()) { setError('Last name is required.'); return; }
    if (lastName.trim().length > 50) { setError('Last name must be 50 characters or less.'); return; }
    const rawPhone = phone.replace(/\D/g, '');
    if (rawPhone && rawPhone.length !== 10) { setError('Phone number must be 10 digits.'); return; }

    if (!user) return;

    setLoading(true);
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        first_name: firstName.trim(),
        last_name:  lastName.trim(),
        phone:      rawPhone ? phone : null,
        home_state: homeState || null,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setSuccess(true);
    onSaved?.();
    setTimeout(() => handleClose(), 1800);
  };

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
              <UserRound className={`h-4 w-4 ${isDark ? 'text-gold' : 'text-primary'}`} />
            </div>
            <DialogTitle className={isDark ? 'text-surface-dark-foreground' : ''}>
              Edit Profile
            </DialogTitle>
          </div>
          <DialogDescription className={isDark ? 'text-surface-dark-muted' : ''}>
            Update your display name, phone number, and home state.
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="h-12 w-12 rounded-full bg-status-complete/15 flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6 text-status-complete" />
            </div>
            <p className={`text-sm font-medium ${isDark ? 'text-surface-dark-foreground' : 'text-foreground'}`}>
              Profile updated!
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            {/* Name row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ep-first" className={labelClass}>First Name</Label>
                <Input
                  id="ep-first"
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  placeholder="Jane"
                  maxLength={50}
                  className={inputClass}
                  required
                  autoComplete="given-name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ep-last" className={labelClass}>Last Name</Label>
                <Input
                  id="ep-last"
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  placeholder="Smith"
                  maxLength={50}
                  className={inputClass}
                  required
                  autoComplete="family-name"
                />
              </div>
            </div>

            {/* Phone */}
            <div className="space-y-1.5">
              <Label htmlFor="ep-phone" className={labelClass}>Phone Number</Label>
              <Input
                id="ep-phone"
                type="tel"
                value={phone}
                onChange={handlePhoneChange}
                placeholder="(555) 000-0000"
                className={inputClass}
                autoComplete="tel"
                inputMode="numeric"
              />
            </div>

            {/* Home state */}
            <div className="space-y-1.5">
              <Label className={labelClass}>Home State</Label>
              <Select value={homeState} onValueChange={setHomeState}>
                <SelectTrigger className={inputClass}>
                  <SelectValue placeholder="Select state…" />
                </SelectTrigger>
                <SelectContent>
                  {US_STATES.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                onClick={handleSubmit}
                disabled={loading || !firstName.trim() || !lastName.trim()}
                className={`flex-1 ${isDark ? 'bg-gold text-surface-dark hover:bg-gold-light font-semibold' : ''}`}
              >
                {loading ? 'Saving…' : 'Save Changes'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
