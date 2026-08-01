import { useEffect } from 'react';
import { toast } from 'sonner';
import {
  DEMO_SUPPRESSED_EVENT, type DemoSuppressionDetail,
} from '@/lib/eld/demoSuppression';

/**
 * Renders the "this would have been sent" notice for demo drivers. Mounted once
 * at the app root so any suppressed send anywhere is visible rather than silent.
 */
export default function DemoSuppressionToaster() {
  useEffect(() => {
    function onSuppressed(e: Event) {
      const detail = (e as CustomEvent<DemoSuppressionDetail>).detail;
      if (!detail?.what) return;
      const to = detail.to?.length ? detail.to.join(', ') : null;
      toast.info(`Demo mode — nothing was sent`, {
        description: [
          detail.what,
          to ? `Would have gone to: ${to}` : null,
          detail.note,
        ].filter(Boolean).join('\n'),
        duration: 9000,
      });
    }
    window.addEventListener(DEMO_SUPPRESSED_EVENT, onSuppressed);
    return () => window.removeEventListener(DEMO_SUPPRESSED_EVENT, onSuppressed);
  }, []);

  return null;
}
