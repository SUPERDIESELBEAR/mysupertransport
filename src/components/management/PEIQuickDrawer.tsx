import { Sheet, SheetContent } from '@/components/ui/sheet';
import { ShieldCheck, X } from 'lucide-react';
import { ApplicationPEITab } from '@/components/pei/ApplicationPEITab';

interface Props {
  open: boolean;
  onClose: () => void;
  applicationId: string | null;
  applicantName?: string | null;
}

/**
 * Lightweight drawer that surfaces the existing ApplicationPEITab from inside
 * the Applicant Pipeline without forcing staff to open the full Application
 * Review drawer. All PEI behavior (auto-build, send, GFE, find-with-AI, edit
 * contact, view response, delete) is inherited unchanged.
 */
export function PEIQuickDrawer({ open, onClose, applicationId, applicantName }: Props) {
  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent
        side="right"
        className="p-0 w-full sm:max-w-3xl flex flex-col"
      >
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b bg-muted/30 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <ShieldCheck className="h-4 w-4 text-gold shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">
                Previous Employment Investigations
              </p>
              {applicantName && (
                <p className="text-xs text-muted-foreground truncate">{applicantName}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
            aria-label="Close PEI panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {applicationId ? (
            <ApplicationPEITab applicationId={applicationId} />
          ) : (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No linked application — PEI can only be initiated for applicants
              with a submitted (or in-progress) application record.
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}