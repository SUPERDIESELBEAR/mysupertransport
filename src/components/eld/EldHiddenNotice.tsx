import { ELD_HIDDEN_MESSAGE } from '@/lib/eld/featureVisibility';

/**
 * Placeholder for a duty-status screen that has been hidden (owner decision
 * (b), 2026-09-17). Deliberately plain: a typed-in URL must render something
 * calm and finished, never a crash, a blank screen or a redirect that loses
 * the driver.
 */
export default function EldHiddenNotice() {
  return (
    <div className="py-16 text-center">
      <p className="text-sm text-muted-foreground">{ELD_HIDDEN_MESSAGE}</p>
    </div>
  );
}
