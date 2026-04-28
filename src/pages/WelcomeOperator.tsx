import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, Eye, EyeOff, CheckCircle2, Truck, FileText, MessageSquare, Star, Mail, Loader2 } from 'lucide-react';
import logo from '@/assets/supertransport-logo.png';
import InstallStep from '@/components/InstallStep';

const FEATURES = [
  { icon: <Truck className="h-4 w-4" />, text: 'Real-time dispatch status updates' },
  { icon: <FileText className="h-4 w-4" />, text: 'Access your documents & resources' },
  { icon: <MessageSquare className="h-4 w-4" />, text: 'Direct messaging with your team' },
  { icon: <Star className="h-4 w-4" />, text: 'Track your onboarding progress' },
];

export default function WelcomeOperator() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [firstName, setFirstName] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [tokenError, setTokenError] = useState(false);

  // Resend invite state
  const [resendEmail, setResendEmail] = useState('');
  const [resendLoading, setResendLoading] = useState(false);
  const [resendError, setResendError] = useState('');
  const [resendSent, setResendSent] = useState(false);

  useEffect(() => {
    // Listen for the SIGNED_IN event that Supabase fires when the invite link is clicked
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && session) {
        setSessionReady(true);
        const meta = session.user.user_metadata;
        setFirstName(meta?.first_name ?? null);
      }
    });

    // Also check for an existing session (in case page reloads after Supabase processes the hash)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setSessionReady(true);
        const meta = session.user.user_metadata;
        setFirstName(meta?.first_name ?? null);
      } else {
        // No session and no hash token — this link may be invalid/expired
        const hash = window.location.hash;
        if (!hash.includes('access_token') && !hash.includes('token_type')) {
          setTokenError(true);
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const strengthScore = (() => {
    if (!password) return 0;
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return score;
  })();

  const strengthLabel = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Very Strong'][strengthScore];
  const strengthColor = ['', 'bg-destructive', 'bg-amber-500', 'bg-yellow-400', 'bg-status-complete', 'bg-status-complete'][strengthScore];

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
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message);
      setLoading(false);
    } else {
      setSuccess(true);
      // Do NOT auto-navigate. Let the user install the PWA first, then continue.
    }
  };

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    setResendError('');
    if (!resendEmail.trim()) {
      setResendError('Please enter your email address.');
      return;
    }
    setResendLoading(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('resend-invite', {
        body: { email: resendEmail.trim() },
      });

      if (fnError) {
        // Try to extract the JSON error message from the response body
        let msg = 'Something went wrong. Please try again.';
        try {
          const ctx = (fnError as any)?.context;
          if (ctx instanceof Response) {
            const json = await ctx.clone().json();
            msg = json?.error ?? msg;
          } else if (typeof ctx?.error === 'string') {
            msg = ctx.error;
          } else {
            msg = fnError.message ?? msg;
          }
        } catch {
          msg = fnError.message ?? msg;
        }
        setResendError(msg);
      } else if (data?.error) {
        setResendError(data.error);
      } else {
        setResendSent(true);
      }
    } catch {
      setResendError('Something went wrong. Please try again.');
    } finally {
      setResendLoading(false);
    }
  };

  const background = (
    <div className="fixed inset-0 overflow-hidden pointer-events-none">
      {/* Subtle radial gold glows */}
      <div className="absolute inset-0" style={{
        backgroundImage: [
          'radial-gradient(ellipse 60% 40% at 10% 20%, hsl(41 47% 54% / 0.06) 0%, transparent 60%)',
          'radial-gradient(ellipse 40% 30% at 90% 80%, hsl(41 47% 54% / 0.04) 0%, transparent 50%)',
          'radial-gradient(ellipse 80% 50% at 50% 100%, hsl(41 47% 54% / 0.03) 0%, transparent 40%)',
        ].join(', ')
      }} />
      {/* Subtle grid texture */}
      <div className="absolute inset-0 opacity-[0.015]" style={{
        backgroundImage: 'linear-gradient(hsl(41 47% 54%) 1px, transparent 1px), linear-gradient(90deg, hsl(41 47% 54%) 1px, transparent 1px)',
        backgroundSize: '48px 48px',
      }} />
    </div>
  );

  // ── Invalid / Expired Token ──────────────────────────────────────
  if (tokenError) {
    return (
      <div className="min-h-screen bg-surface-dark flex items-center justify-center p-4">
        {background}
        <div className="w-full max-w-md relative text-center">
          <img src={logo} alt="SUPERTRANSPORT" className="h-28 w-auto max-w-[400px] object-contain mx-auto mb-8" />
          <div className="bg-surface-dark-card border border-surface-dark-border rounded-xl p-8 shadow-2xl text-left">
            <div className="flex flex-col items-center text-center mb-6">
              <AlertCircle className="h-12 w-12 text-destructive mb-4" />
              <h2 className="text-lg font-semibold text-surface-dark-foreground mb-2">Link Expired or Invalid</h2>
              <p className="text-surface-dark-muted text-sm">
                This invite link has expired or already been used. Enter your email below to request a new one.
              </p>
            </div>

            {resendSent ? (
              <div className="flex flex-col items-center gap-3 py-2">
                <div className="h-12 w-12 rounded-full bg-status-complete/15 border border-status-complete/30 flex items-center justify-center">
                  <CheckCircle2 className="h-6 w-6 text-status-complete" />
                </div>
                <p className="text-surface-dark-foreground font-medium text-sm">Check your inbox</p>
                <p className="text-surface-dark-muted text-xs text-center leading-relaxed">
                  If your email is registered as an approved operator, a new invitation link has been sent.
                </p>
              </div>
            ) : (
              <form onSubmit={handleResend} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="resend-email" className="text-surface-dark-foreground text-sm">
                    Email address
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-surface-dark-muted" />
                    <Input
                      id="resend-email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      value={resendEmail}
                      onChange={e => { setResendEmail(e.target.value); setResendError(''); }}
                      className="pl-9 bg-surface-dark border-surface-dark-border text-surface-dark-foreground placeholder:text-surface-dark-muted focus-visible:ring-gold/40"
                    />
                  </div>
                  {resendError && (
                    <p className="text-destructive text-xs pt-0.5">{resendError}</p>
                  )}
                </div>
                <Button
                  type="submit"
                  disabled={resendLoading}
                  className="w-full bg-gold text-surface-dark font-semibold hover:bg-gold-light h-11"
                >
                  {resendLoading ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" />Sending…</>
                  ) : 'Resend Invitation'}
                </Button>
              </form>
            )}

            <div className="mt-5 pt-4 border-t border-surface-dark-border text-center">
              <button
                onClick={() => navigate('/login')}
                className="text-surface-dark-muted text-xs hover:text-surface-dark-foreground transition-colors"
              >
                Already have an account? Sign in
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Success State ────────────────────────────────────────────────
  if (success) {
    return (
      <div className="min-h-screen bg-surface-dark flex items-center justify-center p-4">
        {background}
        <div className="w-full max-w-md relative text-center">
          <img src={logo} alt="SUPERTRANSPORT" className="h-28 w-auto max-w-[400px] object-contain mx-auto mb-8" />
          <div className="bg-surface-dark-card border border-surface-dark-border rounded-xl p-8 shadow-2xl text-left">
            <div className="flex flex-col items-center text-center mb-6">
              <div className="h-16 w-16 rounded-full bg-status-complete/15 border-2 border-status-complete/40 flex items-center justify-center mb-4">
                <CheckCircle2 className="h-8 w-8 text-status-complete" />
              </div>
              <h2 className="text-xl font-bold text-surface-dark-foreground mb-1">
                You're all set{firstName ? `, ${firstName}` : ''}!
              </h2>
              <p className="text-surface-dark-muted text-sm leading-relaxed">
                One last step — install SUPERDRIVE on your phone for the best experience.
              </p>
            </div>
            <InstallStep
              onContinue={() => navigate('/dashboard')}
              continueLabel="Open My Portal"
            />
          </div>
        </div>
      </div>
    );
  }

  // ── Main Welcome + Password Form ─────────────────────────────────
  return (
    <div className="min-h-screen bg-surface-dark flex items-center justify-center p-4">
      {background}

      <div className="w-full max-w-4xl relative">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">

          {/* ── Left: Branding panel ── */}
          <div className="flex flex-col justify-center lg:py-8">
            <img src={logo} alt="SUPERTRANSPORT" className="h-28 w-auto max-w-[400px] object-contain mb-8" />

            <div className="mb-6">
              <div className="inline-flex items-center gap-2 bg-gold/15 border border-gold/30 rounded-full px-3 py-1 mb-4">
                <span className="h-1.5 w-1.5 rounded-full bg-gold animate-pulse" />
                <span className="text-gold text-xs font-semibold tracking-wide uppercase">Invitation Accepted</span>
              </div>
              <h1 className="text-3xl lg:text-4xl font-bold text-surface-dark-foreground leading-tight mb-3">
                Welcome{firstName ? `,\n${firstName}` : ''} to the{' '}
                <span className="text-gold">SUPERTRANSPORT</span>{' '}
                team.
              </h1>
              <p className="text-surface-dark-muted text-base leading-relaxed">
                You've been approved as an Owner-Operator. Set your password below to access your personal portal.
              </p>
            </div>

            {/* Feature highlights */}
            <div className="space-y-3 mt-2">
              {FEATURES.map((f, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-gold/10 border border-gold/20 flex items-center justify-center text-gold shrink-0">
                    {f.icon}
                  </div>
                  <span className="text-surface-dark-muted text-sm">{f.text}</span>
                </div>
              ))}
            </div>

            <div className="mt-8 pt-6 border-t border-surface-dark-border">
              <p className="text-surface-dark-muted text-xs">
                Questions? Contact us at{' '}
                  <a href="mailto:support@mysupertransport.com" className="text-gold hover:text-gold-light underline underline-offset-2">
                    support@mysupertransport.com
                  </a>
              </p>
            </div>
          </div>

          {/* ── Right: Password form ── */}
          <div className="bg-surface-dark-card border border-surface-dark-border rounded-2xl p-8 shadow-2xl">
            {!sessionReady ? (
              <div className="flex flex-col items-center gap-4 py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-gold border-t-transparent" />
                <p className="text-surface-dark-muted text-sm">Verifying your invitation…</p>
              </div>
            ) : (
              <>
                <div className="mb-6">
                  <h2 className="text-xl font-bold text-surface-dark-foreground mb-1">Create Your Password</h2>
                  <p className="text-surface-dark-muted text-sm">
                    Choose a strong password for your SUPERTRANSPORT account.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                  {/* Password field */}
                  <div className="space-y-2">
                    <Label className="text-surface-dark-foreground text-sm font-medium" htmlFor="password">
                      Password
                    </Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="Min. 8 characters"
                        className="bg-surface-dark border-surface-dark-border text-surface-dark-foreground placeholder:text-surface-dark-muted focus:border-gold focus:ring-gold pr-10 h-11"
                        required
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(v => !v)}
                        tabIndex={-1}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-dark-muted hover:text-surface-dark-foreground transition-colors"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>

                    {/* Strength bar */}
                    {password.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="flex gap-1">
                          {[1, 2, 3, 4, 5].map(n => (
                            <div
                              key={n}
                              className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                                n <= strengthScore ? strengthColor : 'bg-surface-dark-border'
                              }`}
                            />
                          ))}
                        </div>
                        <p className={`text-[11px] font-medium ${
                          strengthScore <= 1 ? 'text-destructive' :
                          strengthScore <= 2 ? 'text-amber-400' :
                          strengthScore <= 3 ? 'text-yellow-400' :
                          'text-status-complete'
                        }`}>
                          {strengthLabel}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Confirm password */}
                  <div className="space-y-2">
                    <Label className="text-surface-dark-foreground text-sm font-medium" htmlFor="confirm">
                      Confirm Password
                    </Label>
                    <div className="relative">
                      <Input
                        id="confirm"
                        type={showConfirm ? 'text' : 'password'}
                        value={confirm}
                        onChange={e => setConfirm(e.target.value)}
                        placeholder="Re-enter your password"
                        className="bg-surface-dark border-surface-dark-border text-surface-dark-foreground placeholder:text-surface-dark-muted focus:border-gold focus:ring-gold pr-10 h-11"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirm(v => !v)}
                        tabIndex={-1}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-dark-muted hover:text-surface-dark-foreground transition-colors"
                      >
                        {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {/* Match indicator */}
                    {confirm.length > 0 && (
                      <p className={`text-[11px] font-medium flex items-center gap-1 ${
                        password === confirm ? 'text-status-complete' : 'text-destructive'
                      }`}>
                        {password === confirm ? (
                          <><CheckCircle2 className="h-3 w-3" /> Passwords match</>
                        ) : (
                          <><AlertCircle className="h-3 w-3" /> Passwords don't match</>
                        )}
                      </p>
                    )}
                  </div>

                  {/* Password hints */}
                  <div className="bg-surface-dark/60 border border-surface-dark-border rounded-lg px-4 py-3">
                    <p className="text-[11px] text-surface-dark-muted font-semibold uppercase tracking-wide mb-2">Password requirements</p>
                    <ul className="space-y-1">
                      {[
                        { label: 'At least 8 characters', met: password.length >= 8 },
                        { label: 'One uppercase letter', met: /[A-Z]/.test(password) },
                        { label: 'One number', met: /[0-9]/.test(password) },
                      ].map(r => (
                        <li key={r.label} className={`flex items-center gap-2 text-[11px] transition-colors ${r.met ? 'text-status-complete' : 'text-surface-dark-muted'}`}>
                          <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${r.met ? 'bg-status-complete' : 'bg-surface-dark-border'}`} />
                          {r.label}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {error && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
                      <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                      <p className="text-sm text-destructive">{error}</p>
                    </div>
                  )}

                  <Button
                    type="submit"
                    disabled={loading || password !== confirm || password.length < 8}
                    className="w-full bg-gold text-surface-dark font-bold hover:bg-gold-light transition-all h-12 text-sm tracking-wide disabled:opacity-40"
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-surface-dark border-t-transparent" />
                        Setting password…
                      </span>
                    ) : (
                      'Activate My Account →'
                    )}
                  </Button>
                </form>

                <p className="text-center text-[11px] text-surface-dark-muted mt-5">
                  Already have a password?{' '}
                  <button
                    onClick={() => navigate('/login')}
                    className="text-gold hover:text-gold-light underline underline-offset-2"
                  >
                    Sign in here
                  </button>
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
