import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { TableHead } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { SortState } from '@/lib/listSorting';

interface Props {
  columnKey: string;
  label: string;
  sort: SortState | null;
  onSort: (columnKey: string) => void;
  className?: string;
  align?: 'left' | 'right';
}

/**
 * Table header cell that cycles asc -> desc -> default sort and shows the
 * active direction. Shared across list pages.
 */
export function SortableTableHead({ columnKey, label, sort, onSort, className, align = 'left' }: Props) {
  const active = sort?.column === columnKey;
  const Icon = !active ? ChevronsUpDown : sort?.direction === 'asc' ? ArrowUp : ArrowDown;

  return (
    <TableHead className={cn(align === 'right' && 'text-right', className)}>
      <button
        type="button"
        onClick={() => onSort(columnKey)}
        aria-label={`Sort by ${label}`}
        className={cn(
          'inline-flex items-center gap-1 -mx-1 px-1 rounded hover:text-foreground transition-colors',
          align === 'right' && 'flex-row-reverse',
          active ? 'text-foreground font-semibold' : 'text-muted-foreground',
        )}
      >
        <span>{label}</span>
        <Icon className={cn('h-3.5 w-3.5 shrink-0', !active && 'opacity-40')} />
      </button>
    </TableHead>
  );
}

export default SortableTableHead;
