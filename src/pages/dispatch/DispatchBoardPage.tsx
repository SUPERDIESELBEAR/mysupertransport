import { Truck } from 'lucide-react';

interface DispatchBoardPageProps {
  /**
   * Provided by the Management portal so a board row can open its own
   * load-detail view, matching how LoadsListPage is embedded. Unused until the
   * board has content.
   */
  onSelectLoad?: (loadId: string) => void;
}

export default function DispatchBoardPage(_props: DispatchBoardPageProps) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-foreground">Dispatch Board</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Every driver, the load they are on, and what is booked behind it.
          </p>
        </div>
      </div>

      {/* Empty state */}
      <div className="rounded-lg border border-border bg-card px-4 py-12 flex flex-col items-center justify-center text-center gap-3">
        <Truck className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          The load-aware board arrives in the next pass.
        </p>
      </div>
    </div>
  );
}
