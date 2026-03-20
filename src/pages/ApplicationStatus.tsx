import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { CheckCircle, Clock, XCircle } from 'lucide-react';
import logo from '@/assets/supertransport-logo.png';

export default function ApplicationStatus() {
  const { profile, user, signOut } = useAuth();

  const status = profile?.account_status ?? 'pending';

  return (
    <div className="min-h-screen bg-surface-dark flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <img src={logo} alt="SuperTransport" className="h-20 max-w-[320px] object-contain mx-auto" />
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
                Thank you for your interest in SuperTransport LLC. After careful review, we are unable to move forward with your application at this time.
                If you have questions, please contact our team at <span className="text-gold">recruiting@mysupertransport.com</span>.
              </p>
            </>
          )}

          <div className="mt-6 pt-5 border-t border-surface-dark-border">
            <p className="text-xs text-surface-dark-muted mb-3">Signed in as {user?.email}</p>
            <Button variant="ghost" onClick={signOut} className="text-surface-dark-muted hover:text-surface-dark-foreground text-sm">
              Sign Out
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
