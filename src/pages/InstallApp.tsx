import { Download, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import InstallStep from "@/components/InstallStep";

export default function InstallApp() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-surface-dark text-white">
      <div className="px-4 pt-6 pb-4 max-w-md mx-auto">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm text-surface-dark-muted hover:text-white transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="flex items-center gap-3 mb-6">
          <div className="h-12 w-12 rounded-xl bg-gold/20 flex items-center justify-center">
            <Download className="h-6 w-6 text-gold" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-wide">Install SUPERDRIVE</h1>
            <p className="text-sm text-surface-dark-muted">Get the full app experience</p>
          </div>
        </div>
      </div>

      <div className="px-4 pb-8 max-w-md mx-auto">
        <div className="bg-surface-dark-card border border-surface-dark-border rounded-xl p-6 shadow-2xl">
          <InstallStep
            onContinue={() => navigate("/dashboard")}
            continueLabel="Open My Portal"
          />
        </div>
        <p className="text-xs text-center text-surface-dark-muted mt-6">
          SUPERDRIVE is a Progressive Web App — no app store download required.
        </p>
      </div>
    </div>
  );
}
