/**
 * EVERY PAGE SHOWS ITS OWN NAME (standing rule, docs/tms-build-status.md).
 *
 * The Applications page is the shape the owner asked for everywhere: the page
 * name exactly as it reads in the menu, and one short line saying what the page
 * is for. This component is that markup, in one place, so a new page cannot
 * invent a different heading style — and so a heading cannot silently drift
 * away from its menu label.
 *
 * THE TITLE MUST BE THE MENU LABEL. Not a longer description of the page, not a
 * prettier version of it. If the two disagree, one of them is wrong. The two
 * owner-approved exceptions are FAQ → Frequently Asked Questions and My Truck
 * → Unit {n}; those page titles are deliberately more useful in context.
 */
import type { ReactNode } from 'react';

interface Props {
  /** Exactly the label used in the sidebar for this page. */
  title: string;
  /** One short line: what the page is for. */
  description?: string;
  /** Usually a lucide icon, rendered at h-6 w-6 in gold. */
  icon?: ReactNode;
  /** Buttons or filters that belong beside the title. */
  actions?: ReactNode;
}

export default function PageHeading({ title, description, icon, actions }: Props) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
          {icon}
          {title}
        </h1>
        {description && (
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
