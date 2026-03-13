import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, CheckCircle2, Eye, EyeOff, LinkIcon } from 'lucide-react';
import logo from '@/assets/supertransport-logo.png';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [validSession, setValidSession] = useState<boolean | null>(null); // null = checking

  useEffect(() => {
    // onAuthStateChange fires first when there's a recovery token in the hash
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' && session) {
        setValidSession(true);
      }
    });

    // Then check for an existing session (page reload after token processed)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setValidSession(true);
      } else {
        // No session and no recovery token in hash → expired / invalid
        const hash = window.location.hash;
        const hasToken = hash.includes('access_token') || hash.includes('token_type');
        if (!hasToken) {
          setValidSession(false);
        }
        // If there IS a hash token, wait for onAuthStateChange to fire
      }
    });

    // Fallback: if after 4s we still haven't resolved, treat as expired
    const fallback = setTimeout(() => {
      setValidSession(prev => prev === null ? false : prev);
    }, 4000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(fallback);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
    } else {
      setSuccess(true);
      setTimeout(() => navigate('/dashboard'), 2500);
    }
    setLoading(false);
  };

  // ── Checking state ──────────────────────────────────────────────────────────
  if (validSession === null) {
    return (
      <div className="min-h-screen bg-surface-dark flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gold border-t-transparent" />
          <p className="text-surface-dark-muted text-sm">Verifying your link…</p>
        </div>
      </div>
    );
  }

  // ── Expired / Invalid ───────────────────────────────────────────────────────
  if (validSession === false) {
    return (
      <div className="min-h-screen bg-surface-dark flex items-center justify-center p-4">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute inset-0" style={{
            backgroundImage: 'radial-gradient(circle at 20% 50%, hsl(41 47% 54% / 0.04) 0%, transparent 50%)'
          }} />
        </div>
        <div className="w-full max-w-md relative text-center">
          <img src={logo} alt="SUPERTRANSPORT" className="h-16 w-auto max-w-[240px] object-contain mx-auto mb-8" />
          <div className="bg-surface-dark-card border border-surface-dark-border rounded-xl p-8 shadow-2xl">
            <div className="h-14 w-14 rounded-full bg-destructive/10 border border-destructive/30 flex items-center justify-center mx-auto mb-4">
              <LinkIcon className="h-7 w-7 text-destructive" />
            </div>
            <h2 className="text-lg font-semibold text-surface-dark-foreground mb-2">Link Expired or Invalid</h2>
            <p className="text-surface-dark-muted text-sm mb-6 leading-relaxed">
              This password reset link has expired or already been used. Request a new one from the login page.
            </p>
            <Button
              onClick={() => navigate('/login')}
              className="w-full bg-gold text-surface-dark font-semibold hover:bg-gold-light h-11"
            >
              Back to Sign In
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-dark flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0" style={{
          backgroundImage: 'radial-gradient(circle at 20% 50%, hsl(41 47% 54% / 0.04) 0%, transparent 50%), radial-gradient(circle at 80% 20%, hsl(41 47% 54% / 0.03) 0%, transparent 40%)'
        }} />
      </div>

      <div className="w-full max-w-md relative">
        <div className="text-center mb-8">
          <img src={logo} alt="SUPERTRANSPORT" className="h-16 w-auto max-w-[240px] object-contain mx-auto" />
          <p className="text-surface-dark-muted text-sm mt-1">Operator Portal</p>
        </div>

        <div className="bg-surface-dark-card border border-surface-dark-border rounded-xl p-8 shadow-2xl">
          {success ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <CheckCircle2 className="h-12 w-12 text-status-complete" />
              <p className="text-surface-dark-foreground text-lg font-semibold">Password Set!</p>
              <p className="text-surface-dark-muted text-sm">Redirecting you to your dashboard…</p>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-surface-dark-foreground mb-2">Set Your Password</h2>
              <p className="text-surface-dark-muted text-sm mb-6">Choose a secure password for your SUPERTRANSPORT account.</p>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label className="text-surface-dark-foreground text-sm" htmlFor="new-password">New Password</Label>
                  <div className="relative">
                    <Input
                      id="new-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Min. 8 characters"
                      className="bg-surface-dark border-surface-dark-border text-surface-dark-foreground placeholder:text-surface-dark-muted focus:border-gold focus:ring-gold pr-10"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-dark-muted hover:text-surface-dark-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-surface-dark-foreground text-sm" htmlFor="confirm-password">Confirm Password</Label>
                  <Input
                    id="confirm-password"
                    type={showPassword ? 'text' : 'password'}
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="Re-enter password"
                    className="bg-surface-dark border-surface-dark-border text-surface-dark-foreground placeholder:text-surface-dark-muted focus:border-gold focus:ring-gold"
                    required
                  />
                </div>

                {error && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
                    <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                    <p className="text-sm text-destructive">{error}</p>
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gold text-surface-dark font-semibold hover:bg-gold-light transition-colors h-11"
                >
                  {loading ? 'Saving…' : 'Set Password & Sign In'}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
