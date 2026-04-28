import { Download, LogIn } from "lucide-react";
import { useNavigate } from "react-router-dom";
import InstallStep from "@/components/InstallStep";
import { useAuth } from "@/hooks/useAuth";

export default function InstallApp() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const handleContinue = () => {
    navigate(user ? "/dashboard" : "/login");
  };

  return (
    <div className="min-h-screen bg-surface-dark text-white">
      <div className="px-4 pt-6 pb-4 max-w-md mx-auto">
        <div className="flex items-center justify-between mb-6">
          <p className="text-[11px] font-bold tracking-[0.18em] text-surface-dark-muted">
            SUPERTRANSPORT
          </p>
          <button
            onClick={() => navigate(user ? "/dashboard" : "/login")}
            className="flex items-center gap-1 text-xs text-surface-dark-muted hover:text-gold transition-colors"
          >
            <LogIn className="h-3.5 w-3.5" /> {user ? "My portal" : "Sign in"}
          </button>
        </div>
        <div className="flex items-center gap-3 mb-6">
          <div className="h-12 w-12 rounded-xl bg-gold/20 flex items-center justify-center">
            <Download className="h-6 w-6 text-gold" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-wide">Install SUPERDRIVE</h1>
            <p className="text-sm text-surface-dark-muted">Step-by-step install guide</p>
          </div>
        </div>
      </div>

      <div className="px-4 pb-8 max-w-md mx-auto">
        <div className="bg-surface-dark-card border border-surface-dark-border rounded-xl p-6 shadow-2xl">
          <InstallStep
            onContinue={handleContinue}
            continueLabel={user ? "Open My Portal" : "Go to Sign In"}
          />
        </div>
        <p className="text-xs text-center text-surface-dark-muted mt-6 leading-relaxed">
          SUPERDRIVE is a Progressive Web App — no app store download required.
          <br />
          Need help? Reply to your invite email and we'll guide you through it.
        </p>
      </div>
    </div>
  );
}
