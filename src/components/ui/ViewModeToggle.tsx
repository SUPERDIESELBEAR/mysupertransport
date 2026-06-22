import { LayoutGrid, List } from 'lucide-react';

export type ViewMode = 'cards' | 'table';

interface ViewModeToggleProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
  className?: string;
}

/**
 * Shared Cards/Table toggle used across Dispatch, Driver Hub, and Vehicle Hub
 * so the control looks and behaves identically wherever it appears.
 */
export function ViewModeToggle({ value, onChange, className = '' }: ViewModeToggleProps) {
  return (
    <div
      className={`flex items-center bg-muted rounded-lg p-0.5 border border-border shrink-0 ${className}`}
    >
      <button
        type="button"
        onClick={() => onChange('cards')}
        className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
          value === 'cards'
            ? 'bg-white text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        }`}
        aria-pressed={value === 'cards'}
        title="Cards view"
      >
        <LayoutGrid className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Cards</span>
      </button>
      <button
        type="button"
        onClick={() => onChange('table')}
        className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
          value === 'table'
            ? 'bg-white text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        }`}
        aria-pressed={value === 'table'}
        title="Table view"
      >
        <List className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Table</span>
      </button>
    </div>
  );
}

export default ViewModeToggle;