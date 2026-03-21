import { useState, useEffect, useRef, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
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
import { UserRound, CheckCircle2, Camera, Loader2, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

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
  const { user, profile, refreshProfile } = useAuth();

  // Initialize directly from profile so the Save button is never momentarily disabled
  const [firstName, setFirstName]   = useState(() => profile?.first_name ?? '');
  const [lastName, setLastName]     = useState(() => profile?.last_name ?? '');
  const [phone, setPhone]           = useState(() => profile?.phone ?? '');
  const [homeState, setHomeState]   = useState(() => profile?.home_state ?? '');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [success, setSuccess]       = useState(false);

  // Avatar state
  const [avatarUrl, setAvatarUrl]         = useState<string | null>(() => profile?.avatar_url ?? null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError]     = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isDark = variant === 'dark';

  // Re-seed whenever the modal opens (handles profile updates between opens)
  useEffect(() => {
    if (open && profile) {
      setFirstName(profile.first_name ?? '');
      setLastName(profile.last_name ?? '');
      setPhone(profile.phone ?? '');
      setHomeState(profile.home_state ?? '');
      setAvatarUrl(profile.avatar_url ?? null);
      setError(null);
      setAvatarError(null);
      setSuccess(false);
    }
  }, [open, profile]);

  const handleClose = () => {
    setError(null);
    setAvatarError(null);
    setSuccess(false);
    onClose();
  };

  const formatPhone = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0,3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhone(formatPhone(e.target.value));
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setAvatarError(null);

    // Validate type
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setAvatarError('Please upload a JPEG, PNG, or WebP image.');
      return;
    }

    // Validate size (5 MB)
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError('Image must be under 5 MB.');
      return;
    }

    setAvatarUploading(true);
    try {
      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      const path = `${user.id}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      // Persist to profiles table immediately
      const { error: dbError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('user_id', user.id);

      if (dbError) throw dbError;

      setAvatarUrl(publicUrl);
      await refreshProfile();
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setAvatarUploading(false);
      // Reset input so same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveAvatar = async () => {
    if (!user) return;
    setAvatarError(null);
    setAvatarUploading(true);
    try {
      const { error: dbError } = await supabase
        .from('profiles')
        .update({ avatar_url: null })
        .eq('user_id', user.id);
      if (dbError) throw dbError;
      setAvatarUrl(null);
      await refreshProfile();
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Failed to remove photo.');
    } finally {
      setAvatarUploading(false);
    }
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

  const displayName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'User';
  const initials = displayName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || '?';

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
            Update your photo, display name, phone number, and home state.
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
            {/* Avatar picker */}
            <div className="flex flex-col items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleAvatarChange}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={avatarUploading}
                className="relative group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold rounded-full"
                title="Change profile photo"
              >
                <div className={`h-20 w-20 rounded-full overflow-hidden border-2 transition-all ${
                  isDark ? 'border-surface-dark-border group-hover:border-gold/60' : 'border-border group-hover:border-primary/50'
                }`}>
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt="Profile photo"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className={`h-full w-full flex items-center justify-center ${isDark ? 'bg-surface-dark-card' : 'bg-muted'}`}>
                      <span className={`text-2xl font-bold ${isDark ? 'text-gold' : 'text-muted-foreground'}`}>{initials}</span>
                    </div>
                  )}
                </div>
                {/* Camera overlay */}
                <div className={`absolute inset-0 rounded-full flex items-center justify-center transition-opacity ${
                  avatarUploading ? 'opacity-100 bg-black/40' : 'opacity-0 group-hover:opacity-100 bg-black/40'
                }`}>
                  {avatarUploading ? (
                    <Loader2 className="h-6 w-6 text-white animate-spin" />
                  ) : (
                    <Camera className="h-6 w-6 text-white" />
                  )}
                </div>
              </button>
              <p className={`text-xs ${isDark ? 'text-surface-dark-muted' : 'text-muted-foreground'}`}>
                Click to {avatarUrl ? 'change' : 'add'} photo · JPEG, PNG, WebP · max 5 MB
              </p>
              {avatarUrl && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      type="button"
                      disabled={avatarUploading}
                      className={`flex items-center gap-1 text-xs transition-colors ${
                        isDark
                          ? 'text-surface-dark-muted hover:text-destructive'
                          : 'text-muted-foreground hover:text-destructive'
                      }`}
                    >
                      <Trash2 className="h-3 w-3" />
                      Remove photo
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove profile photo?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Your photo will be removed and replaced with your initials. You can upload a new one any time.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleRemoveAvatar}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Remove photo
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              {avatarError && (
                <p className="text-xs text-destructive">{avatarError}</p>
              )}
            </div>

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
                className="flex-1 bg-gold text-surface-dark hover:bg-gold-light font-semibold"
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
