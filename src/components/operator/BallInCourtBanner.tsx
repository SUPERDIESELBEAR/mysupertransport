import { AlertCircle, CheckCircle2 } from 'lucide-react';

interface BallInCourtBannerProps {
  value: 'driver' | 'staff';
  onAction?: () => void;
}

/**
 * Friendly handoff banner shown to the driver on their onboarding status page.
 */
export function BallInCourtBanner({ value, onAction }: BallInCourtBannerProps) {
  if (value === 'driver') {
    return (
      <div
        role="status"
        className="rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 flex items-start gap-3"
      >
        <AlertCircle className="h-5 w-5 text-gold shrink-0 mt-0.5" aria-hidden />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">Action required</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Please complete your pending steps to continue onboarding.
          </p>
        </div>
        {onAction && (
          <button
            type="button"
            onClick={onAction}
            className="text-xs font-semibold text-gold hover:underline shrink-0 mt-0.5"
          >
            View
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      role="status"
      className="rounded-xl border border-border bg-muted/40 px-4 py-3 flex items-start gap-3"
    >
      <CheckCircle2 className="h-5 w-5 text-status-complete shrink-0 mt-0.5" aria-hidden />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">You're all caught up</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Our team is reviewing your information. We'll reach out when the next step is ready.
        </p>
      </div>
    </div>
  );
}

export default BallInCourtBanner;