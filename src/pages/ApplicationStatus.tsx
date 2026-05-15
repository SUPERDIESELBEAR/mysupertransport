import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { CheckCircle, Clock, XCircle, Mail, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import logo from '@/assets/supertransport-logo.png';

export default function ApplicationStatus() {
  const { profile, user, signOut } = useAuth();
  const [resending, setResending] = useState(false);
  const [lastResend, setLastResend] = useState<{ at: number; mode: 'revisions' | 'resume' } | null>(null);

  const status = profile?.account_status ?? 'pending';
  const storageKey = user ? `applicant_last_resend:${user.id}` : null;

  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setLastResend(JSON.parse(raw));
    } catch { /* ignore */ }
  }, [storageKey]);

  const formatLastResend = (at: number) => {
    return new Date(at).toLocaleString('en-US', {
      timeZone: 'America/Chicago',
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    }) + ' CT';
  };

  const handleResend = async () => {
    setResending(true);
    try {
      const { data: app, error: appErr } = await supabase
        .from('applications')
        .select('id')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (appErr || !app) {
        toast.error("We couldn't find your application on file.");
        return;
      }
      const { data, error } = await supabase.functions.invoke('resend-application-link', {
        body: { applicationId: app.id },
      });
      if (error) {
        const ctx: any = (error as any).context;
        let msg = 'Could not send the email. Please try again in a moment.';
        try {
          const parsed = ctx?.body ? JSON.parse(ctx.body) : null;
          if (parsed?.message) msg = parsed.message;
        } catch { /* ignore */ }
        toast.error(msg);
        return;
      }
      if ((data as any)?.success) {
        const mode = ((data as any)?.mode === 'revisions' ? 'revisions' : 'resume') as 'revisions' | 'resume';
        const entry = { at: Date.now(), mode };
        setLastResend(entry);
        if (storageKey) {
          try { localStorage.setItem(storageKey, JSON.stringify(entry)); } catch { /* ignore */ }
        }
        toast.success(`A fresh link was sent to ${user?.email}. Check your inbox.`);
      } else {
        toast.error('Could not send the email. Please try again in a moment.');
      }
    } catch (err) {
      console.error('resend application link error', err);
      toast.error('Something went wrong. Please try again.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-dark flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <img src={logo} alt="SuperTransport" className="h-28 max-w-[400px] object-contain mx-auto" />
        </div>

        <div className="bg-surface-dark-card border border-surface-dark-border rounded-xl p-8 shadow-2xl text-center">
          {status === 'pending' && (
            <>
              <div className="flex justify-center mb-4">
                <div className="h-16 w-16 rounded-full bg-status-progress/15 flex items-center justify-center">
                  <Clock className="h-8 w-8 text-status-progress" />
                </div>
              </div>
              <h2 className="text-xl font-semibold text-surface-dark-foreground mb-3">Application Under Review</h2>
              <p className="text-surface-dark-muted text-sm leading-relaxed">
                Thank you for applying with SUPERTRANSPORT. Your application has been received and is currently being reviewed by our team.
                Most applications are reviewed within 1–3 business days. You will receive an email notification once a decision has been made.
              </p>
            </>
          )}

          {status === 'active' && (
            <>
              <div className="flex justify-center mb-4">
                <div className="h-16 w-16 rounded-full bg-status-complete/15 flex items-center justify-center">
                  <CheckCircle className="h-8 w-8 text-status-complete" />
                </div>
              </div>
              <h2 className="text-xl font-semibold text-surface-dark-foreground mb-3">Application Approved!</h2>
              <p className="text-surface-dark-muted text-sm leading-relaxed mb-6">
                Congratulations! Your application has been approved. Please complete your account setup to access the full Operator Portal.
              </p>
              <Button className="bg-gold text-surface-dark font-semibold hover:bg-gold-light">
                Complete Account Setup
              </Button>
            </>
          )}

          {status === 'denied' && (
            <>
              <div className="flex justify-center mb-4">
                <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
                  <XCircle className="h-8 w-8 text-destructive" />
                </div>
              </div>
              <h2 className="text-xl font-semibold text-surface-dark-foreground mb-3">Application Not Approved</h2>
              <p className="text-surface-dark-muted text-sm leading-relaxed">
                Thank you for your interest in SUPERTRANSPORT. After careful review, we are unable to move forward with your application at this time.
                If you have questions, please contact our team at <span className="text-gold">recruiting@mysupertransport.com</span>.
              </p>
            </>
          )}

          <div className="mt-6 pt-5 border-t border-surface-dark-border">
            <p className="text-xs text-surface-dark-muted mb-3">Signed in as {user?.email}</p>
            <Button
              onClick={handleResend}
              disabled={resending}
              variant="outline"
              className="w-full mb-3 border-gold/40 text-gold hover:bg-gold/10 hover:text-gold"
            >
              {resending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending…</>
              ) : (
                <><Mail className="h-4 w-4 mr-2" /> Resend application link</>
              )}
            </Button>
            {lastResend && (
              <p className="text-xs text-surface-dark-muted mb-3">
                Last {lastResend.mode === 'revisions' ? 'revisions' : 'resume'} link sent {formatLastResend(lastResend.at)}
              </p>
            )}
            <Button variant="ghost" onClick={signOut} className="text-surface-dark-muted hover:text-surface-dark-foreground text-sm">
              Sign Out
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
