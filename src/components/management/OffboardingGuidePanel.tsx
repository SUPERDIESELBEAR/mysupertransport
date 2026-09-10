import { useState } from 'react';
import { ChevronDown, ChevronRight, HelpCircle } from 'lucide-react';

/**
 * The written procedure, kept beside the thing it describes. Staff asked where
 * to begin; the answer belongs on the screen that begins it, not only in a
 * library page nobody opens mid-task.
 */
export const OFFBOARDING_STEPS: { title: string; detail: string }[] = [
  { title: 'Reason & date', detail: 'Why they are leaving and their last day. You type the driver’s name to confirm. If they still look dispatched you get a warning and the option to park them instead.' },
  { title: 'Unit disposition', detail: 'Does the truck leave with the driver, stay leased to us for a new driver, or is it undecided.' },
  { title: 'DOT consultant notice', detail: 'Sends the notification and stamps the date it went.' },
  { title: 'Lease termination (Appendix C)', detail: 'Sign it, read it in full, and send it to insurance from this same step.' },
  { title: 'Equipment return', detail: 'Assignment sheet, return instructions email, decal removal photos from both sides, and the shipping receipt.' },
  { title: 'Fuel card', detail: 'Deactivate any card assigned to them.' },
  { title: 'Plate release', detail: 'Release the Missouri plate, or keep it with the unit if the truck stays with us.' },
  { title: 'End the agreement', detail: 'Mark the ICA void with a reason. The record stays on file, stamped VOID — it is never deleted.' },
  { title: 'Login', detail: 'Keep their sign-in open or switch it off. The choice is applied when you finish.' },
  { title: 'Confirm & finish', detail: 'Review everything done and everything skipped with its reason, then finalize.' },
];

export default function OffboardingGuidePanel() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-border bg-muted/30 mb-4" data-testid="offboarding-guide">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left"
      >
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        <HelpCircle className="h-4 w-4 text-gold" />
        <span className="text-sm font-semibold text-foreground">How this works — start here</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            This screen is the only place a driver is offboarded. Do not start from the plate registry,
            the fuel card hub, Onboard Systems, or the Lease Terminations list — those are for looking
            things up. Every step below is saved the moment you finish or skip it, so you can stop at
            any point and resume from the driver’s profile. Any step can be skipped with a written reason.
          </p>
          <ol className="space-y-2">
            {OFFBOARDING_STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-3 text-xs">
                <span className="shrink-0 h-5 w-5 rounded-full bg-gold/15 text-gold flex items-center justify-center font-semibold">
                  {i + 1}
                </span>
                <span>
                  <span className="font-medium text-foreground">{s.title}</span>
                  <span className="text-muted-foreground"> — {s.detail}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
