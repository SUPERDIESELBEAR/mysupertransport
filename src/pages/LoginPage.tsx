import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle } from 'lucide-react';
import logo from '@/assets/supertransport-logo.png';

export default function LoginPage() {
  const { signIn, user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/dashboard" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await signIn(email, password);
    if (error) {
      setError('Invalid email or password. Please try again.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-surface-dark flex items-center justify-center p-4">
      {/* Background texture */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0" style={{
          backgroundImage: 'radial-gradient(circle at 20% 50%, hsl(41 47% 54% / 0.04) 0%, transparent 50%), radial-gradient(circle at 80% 20%, hsl(41 47% 54% / 0.03) 0%, transparent 40%)'
        }} />
      </div>

      <div className="w-full max-w-md relative">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="h-12 w-12 rounded-full bg-gold flex items-center justify-center">
              <Truck className="h-6 w-6 text-surface-dark" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-surface-dark-foreground tracking-tight">
            SUPERTRANSPORT
          </h1>
          <p className="text-surface-dark-muted text-sm mt-1">Operator Portal</p>
        </div>

        {/* Login Card */}
        <div className="bg-surface-dark-card border border-surface-dark-border rounded-xl p-8 shadow-2xl">
          <h2 className="text-lg font-semibold text-surface-dark-foreground mb-6">Staff Sign In</h2>

          <form onSubmit={handleSubmit} className="space-y-5">
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
              <Label className="text-surface-dark-foreground text-sm" htmlFor="password">Password</Label>
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

          <div className="mt-6 pt-5 border-t border-surface-dark-border text-center">
            <p className="text-surface-dark-muted text-xs">
              Applying to drive with SuperTransport?{' '}
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
