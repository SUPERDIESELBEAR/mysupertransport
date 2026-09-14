import { ChevronDown, ChevronRight } from 'lucide-react';

export interface NoteSummary {
  count: number;
  latest: string;
}

interface Props {
  applicationId: string;
  applicantName: string;
  notes?: NoteSummary | null;
  expanded: boolean;
  onToggle: () => void;
}

/**
 * Stateful Interview-column trigger for the Applications list.
 *
 * - No notes → "Add note" in muted gray.
 * - Notes exist → "See note"/"See notes" in gold, with count and latest author.
 *
 * The button is purely presentational; the parent owns the expand/collapse
 * state and the note summary data.
 */
export function ApplicationInterviewNotesButton({
  applicationId,
  applicantName,
  notes,
  expanded,
  onToggle,
}: Props) {
  const label = notes
    ? `See ${notes.count} interview note${notes.count !== 1 ? 's' : ''} for ${applicantName}, most recent by ${notes.latest}`
    : `Add interview note for ${applicantName}`;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      className="flex items-center gap-1.5 text-xs text-left transition-colors"
    >
      {expanded ? (
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      ) : (
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      )}
      {notes ? (
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="text-gold font-medium shrink-0">See note{notes.count !== 1 ? 's' : ''}</span>
          <span className="text-muted-foreground truncate">
            {notes.count} · {notes.latest}
          </span>
        </span>
      ) : (
        <span className="text-muted-foreground hover:text-gold">Add note</span>
      )}
    </button>
  );
}

export default ApplicationInterviewNotesButton;
