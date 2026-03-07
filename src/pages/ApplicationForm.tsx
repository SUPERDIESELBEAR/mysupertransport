import { Truck } from 'lucide-react';
import logo from '@/assets/supertransport-logo.png';

export default function ApplicationForm() {
  return (
    <div className="min-h-screen bg-surface-dark flex items-center justify-center p-4">
      <div className="w-full max-w-lg text-center">
        <div className="flex items-center justify-center gap-3 mb-6">
          <img src={logo} alt="SUPERTRANSPORT" className="h-28 w-auto" />
        </div>
        <p className="text-gold text-sm font-medium mb-8">Driver Application</p>
        <div className="bg-surface-dark-card border border-surface-dark-border rounded-xl p-8">
          <p className="text-surface-dark-foreground font-semibold mb-2">Application Form Coming Soon</p>
          <p className="text-surface-dark-muted text-sm">
            The full FMCSA-compliant multi-step application form will be available here. 
            It includes personal info, CDL details, employment history, safety history, document uploads, and e-signature.
          </p>
          <div className="mt-6 pt-5 border-t border-surface-dark-border">
            <p className="text-xs text-surface-dark-muted">
              Already applied?{' '}
              <a href="/login" className="text-gold hover:text-gold-light underline">Sign in to check your status</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
