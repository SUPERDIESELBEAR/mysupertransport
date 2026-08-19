import { Columns3, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface ColumnToggleDef {
  key: string;
  label: string;
  /** Locked columns are always shown and cannot be unchecked. */
  locked?: boolean;
}

interface Props {
  columns: ColumnToggleDef[];
  visible: string[];
  onChange: (next: string[]) => void;
  onReset: () => void;
}

/**
 * Generic column visibility popover for list pages. Keeps column order stable
 * by always emitting keys in the declared column order.
 */
export function ColumnVisibilityMenu({ columns, visible, onChange, onReset }: Props) {
  const visibleSet = new Set(visible);
  const optional = columns.filter(c => !c.locked);
  const hiddenCount = optional.filter(c => !visibleSet.has(c.key)).length;

  const toggle = (key: string) => {
    const next = new Set(visibleSet);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(columns.filter(c => c.locked || next.has(c.key)).map(c => c.key));
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`gap-2 h-10 ${hiddenCount > 0 ? 'border-gold text-gold bg-gold/5' : ''}`}
        >
          <Columns3 className="h-4 w-4" />
          <span className="hidden sm:inline">Columns</span>
          {hiddenCount > 0 && (
            <span className="h-4 min-w-4 px-1 rounded-full bg-gold text-[10px] font-bold text-white flex items-center justify-center leading-none">
              {hiddenCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-3 bg-popover z-50">
        <div className="space-y-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Visible Columns</p>
            <p className="text-[11px] text-muted-foreground/80 leading-snug mt-0.5">
              Saved to your account only — other staff keep their own view.
            </p>
          </div>
          <div className="space-y-1.5 pt-1 max-h-72 overflow-y-auto">
            {columns.map(col => (
              <label
                key={col.key}
                className={`flex items-center gap-2 text-sm rounded px-1 py-0.5 ${
                  col.locked ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-muted/60'
                }`}
              >
                <Checkbox
                  checked={col.locked ? true : visibleSet.has(col.key)}
                  disabled={col.locked}
                  onCheckedChange={() => !col.locked && toggle(col.key)}
                  aria-label={col.label}
                />
                <span>{col.label}</span>
              </label>
            ))}
          </div>
          <div className="pt-1 border-t border-border">
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-gold transition-colors"
            >
              <RotateCcw className="h-3 w-3" />
              Reset to defaults
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default ColumnVisibilityMenu;
