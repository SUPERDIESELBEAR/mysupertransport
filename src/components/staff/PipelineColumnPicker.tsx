import React from 'react';
import { Columns3, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface PipelineColumnDef {
  key: string;
  label: string;
  /** Responsive class already applied to the th/td pair */
  responsive: string;
}

/** Optional (hideable) pipeline table columns. Name + Progress Track are always on. */
export const PIPELINE_COLUMNS: PipelineColumnDef[] = [
  { key: 'phone', label: 'Phone', responsive: 'hidden md:table-cell' },
  { key: 'state', label: 'State', responsive: 'hidden lg:table-cell' },
  { key: 'start_date', label: 'Anticipated Start Date', responsive: 'hidden lg:table-cell' },
  { key: 'coordinator', label: 'Coordinator', responsive: 'hidden xl:table-cell' },
  { key: 'msgs', label: 'Msgs', responsive: 'hidden md:table-cell' },
  { key: 'compliance', label: 'CDL / Med Cert', responsive: '' },
  { key: 'last_activity', label: 'Last Activity', responsive: 'hidden xl:table-cell' },
];

export const DEFAULT_PIPELINE_COLUMNS = PIPELINE_COLUMNS.map(c => c.key);

interface Props {
  visible: string[];
  onChange: (next: string[]) => void;
}

export function PipelineColumnPicker({ visible, onChange }: Props) {
  const visibleSet = new Set(visible);
  const hiddenCount = PIPELINE_COLUMNS.length - PIPELINE_COLUMNS.filter(c => visibleSet.has(c.key)).length;

  const toggle = (key: string) => {
    const next = new Set(visibleSet);
    next.has(key) ? next.delete(key) : next.add(key);
    onChange(PIPELINE_COLUMNS.filter(c => next.has(c.key)).map(c => c.key));
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`gap-2 ${hiddenCount > 0 ? 'border-gold text-gold bg-gold/5' : ''}`}
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
      <PopoverContent align="start" className="w-60 p-3 bg-popover z-50">
        <div className="space-y-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Visible Columns</p>
            <p className="text-[11px] text-muted-foreground/80 leading-snug mt-0.5">
              Saved to your account only — other staff keep their own view.
            </p>
          </div>
          <div className="space-y-1.5 pt-1">
            {PIPELINE_COLUMNS.map(col => (
              <label
                key={col.key}
                className="flex items-center gap-2 text-sm cursor-pointer rounded px-1 py-0.5 hover:bg-muted/60"
              >
                <Checkbox
                  checked={visibleSet.has(col.key)}
                  onCheckedChange={() => toggle(col.key)}
                />
                <span>{col.label}</span>
              </label>
            ))}
          </div>
          <div className="pt-1 border-t border-border">
            <button
              type="button"
              onClick={() => onChange(DEFAULT_PIPELINE_COLUMNS)}
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