import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react';
import logo from '@/assets/supertransport-logo.png';

type View = 'login' | 'forgot';

export default function LoginPage() {
  const { signIn, user, isDispatcher, isManagement, isOnboardingStaff, loading: authLoading } = useAuth();
  const [view, setView] = useState<View>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  // Role-based redirect: dispatcher-only users go straight to /dispatch
  if (user && !authLoading) {
    if (isDispatcher && !isManagement && !isOnboardingStaff) return <Navigate to="/dispatch" replace />;
    return <Navigate to="/dashboard" replace />;
  }


  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await signIn(email, password);
    if (error) setError('Invalid email or password. Please try again.');
    setLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      setError(error.message);
    } else {
      setResetSent(true);
    }
    setLoading(false);
  };

  const background = (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute inset-0" style={{
        backgroundImage: 'radial-gradient(circle at 20% 50%, hsl(41 47% 54% / 0.04) 0%, transparent 50%), radial-gradient(circle at 80% 20%, hsl(41 47% 54% / 0.03) 0%, transparent 40%)'
      }} />
    </div>
  );

  return (
    <div className="min-h-screen bg-surface-dark flex items-center justify-center p-4">
      {background}

      <div className="w-full max-w-md relative">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <img src={logo} alt="SUPERTRANSPORT" className="h-24 w-auto" />
          </div>
          <p className="text-surface-dark-muted text-sm mt-1">Operator Portal</p>
        </div>

        <div className="bg-surface-dark-card border border-surface-dark-border rounded-xl p-8 shadow-2xl">

          {/* ── SIGN IN VIEW ── */}
          {view === 'login' && (
            <>
              <h2 className="text-lg font-semibold text-surface-dark-foreground mb-6">Staff Sign In</h2>
              <form onSubmit={handleSignIn} className="space-y-5">
                <div className="space-y-2">
                  <Label className="text-surface-dark-foreground text-sm" htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@supertransportllc.com"
                    className="bg-surface-dark border-surface-dark-border text-surface-dark-foreground placeholder:text-surface-dark-muted focus:border-gold focus:ring-gold"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-surface-dark-foreground text-sm" htmlFor="password">Password</Label>
                    <button
                      type="button"
                      onClick={() => { setView('forgot'); setError(''); }}
                      className="text-xs text-gold hover:text-gold-light underline underline-offset-2"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
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
                  {loading ? 'Signing in…' : 'Sign In'}
                </Button>
              </form>
            </>
          )}

          {/* ── FORGOT PASSWORD VIEW ── */}
          {view === 'forgot' && (
            <>
              <button
                onClick={() => { setView('login'); setError(''); setResetSent(false); }}
                className="flex items-center gap-1.5 text-surface-dark-muted hover:text-surface-dark-foreground text-sm mb-5 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" /> Back to Sign In
              </button>

              <h2 className="text-lg font-semibold text-surface-dark-foreground mb-2">Reset Your Password</h2>
              <p className="text-surface-dark-muted text-sm mb-6">
                Enter your email and we'll send you a link to set a new password.
              </p>

              {resetSent ? (
                <div className="flex flex-col items-center gap-3 py-4 text-center">
                  <CheckCircle2 className="h-10 w-10 text-status-complete" />
                  <p className="text-surface-dark-foreground font-medium">Check your email</p>
                  <p className="text-surface-dark-muted text-sm">
                    A password reset link has been sent to <strong className="text-surface-dark-foreground">{email}</strong>.
                  </p>
                  <button
                    onClick={() => { setView('login'); setResetSent(false); }}
                    className="mt-2 text-sm text-gold hover:text-gold-light underline underline-offset-2"
                  >
                    Back to Sign In
                  </button>
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-5">
                  <div className="space-y-2">
                    <Label className="text-surface-dark-foreground text-sm" htmlFor="reset-email">Email Address</Label>
                    <Input
                      id="reset-email"
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="you@supertransportllc.com"
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
                    {loading ? 'Sending…' : 'Send Reset Link'}
                  </Button>
                </form>
              )}
            </>
          )}

          <div className="mt-6 pt-5 border-t border-surface-dark-border text-center">
            <p className="text-surface-dark-muted text-xs">
              Applying to drive with SUPERTRANSPORT?{' '}
              <a href="/apply" className="text-gold hover:text-gold-light underline underline-offset-2">
                Start your application
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
