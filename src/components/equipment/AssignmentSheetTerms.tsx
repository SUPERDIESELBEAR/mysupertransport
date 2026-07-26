import { AlertTriangle, CheckCircle2 } from 'lucide-react';

interface Props {
  bestpassIncluded?: boolean | null;
  /** When provided, the acknowledgement renders as an affirmed statement instead of plain text. */
  acknowledgedBy?: string | null;
  acknowledgedAt?: string | null;
  /** Hide the acknowledgement sentence (e.g. when a checkbox renders it separately). */
  hideAcknowledgement?: boolean;
  className?: string;
}

export const ASSIGNMENT_SHEET_ACK_TEXT =
  'I have received the devices listed above and agree to these terms.';

export default function AssignmentSheetTerms({
  bestpassIncluded,
  acknowledgedBy,
  acknowledgedAt,
  hideAcknowledgement,
  className = '',
}: Props) {
  return (
    <div className={`rounded-md border border-gold/30 bg-gold/5 p-3 text-xs space-y-1.5 ${className}`}>
      <div className="flex items-center gap-1.5 text-gold font-semibold">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        Important Notice — Equipment Return &amp; Charges
      </div>
      <ul className="list-disc pl-4 text-muted-foreground space-y-1">
        <li>
          Unreturned ELD equipment will be assessed a{' '}
          <strong className="text-foreground">$1,000.00</strong> replacement charge.
        </li>
        <li>Additional charges may be incurred for unreturned license plates or other issued equipment.</li>
        {bestpassIncluded && (
          <li>
            A BestPass transponder fee of <strong className="text-foreground">$60.00</strong> is acknowledged on this
            sheet.
          </li>
        )}
      </ul>
      {hideAcknowledgement ? null : acknowledgedAt ? (
        <div className="flex items-start gap-2 pt-1 text-foreground">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-complete" />
          <span>
            {ASSIGNMENT_SHEET_ACK_TEXT}
            <span className="block text-[11px] text-muted-foreground mt-0.5">
              Acknowledged{acknowledgedBy ? ` by ${acknowledgedBy}` : ''} on {acknowledgedAt}
            </span>
          </span>
        </div>
      ) : (
        <p className="pt-1 text-foreground">{ASSIGNMENT_SHEET_ACK_TEXT}</p>
      )}
    </div>
  );
}
