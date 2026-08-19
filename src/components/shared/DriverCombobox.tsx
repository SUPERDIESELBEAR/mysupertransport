import { useMemo, useState } from 'react';
import { AlertTriangle, Check, ChevronsUpDown, User, EyeOff, Eye, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export type DriverComboboxStatus = 'eligible' | 'warning' | 'blocked';

export interface DriverComboboxOption {
  userId: string;
  name: string;
  /** Vehicle / unit number — searchable and shown beside the name. */
  unitNumber?: string | null;
  /** Defaults to active when omitted. */
  isActive?: boolean;
  /** Optional compliance state — renders a colored indicator with a tooltip. */
  status?: DriverComboboxStatus;
  /** Plain-language issue list backing the indicator tooltip. */
  statusDetail?: string[];
}

const STATUS_META: Record<DriverComboboxStatus, {
  Icon: typeof Check; className: string; label: string; fallback: string;
}> = {
  eligible: { Icon: Check, className: 'text-success', label: 'Eligible', fallback: 'No compliance issues' },
  warning: { Icon: AlertTriangle, className: 'text-warning', label: 'Warnings', fallback: 'Has warnings' },
  blocked: { Icon: XCircle, className: 'text-destructive', label: 'Blocked', fallback: 'Has blocking issues' },
};

function summarize(status: DriverComboboxStatus, detail?: string[]): string[] {
  const items = (detail ?? []).filter(Boolean);
  if (!items.length) return [STATUS_META[status].fallback];
  if (items.length <= 3) return items;
  return [...items.slice(0, 3), `+${items.length - 3} more`];
}

function StatusIndicator({ status, detail }: { status: DriverComboboxStatus; detail?: string[] }) {
  const { Icon, className, label } = STATUS_META[status];
  const lines = summarize(status, detail);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          role="img"
          aria-label={`${label}: ${lines.join('; ')}`}
          className="shrink-0 outline-none"
        >
          <Icon className={cn('h-4 w-4', className)} />
        </span>
      </TooltipTrigger>
      <TooltipContent side="left" className="max-w-[240px]">
        <p className="font-medium">{label}</p>
        <ul className="mt-0.5 space-y-0.5 text-xs">
          {lines.map(l => <li key={l}>{l}</li>)}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}

interface Props {
  operators: DriverComboboxOption[];
  value: string;
  onChange: (userId: string) => void;
  placeholder?: string;
  triggerClassName?: string;
  size?: 'sm' | 'md';
  emptyText?: string;
}

function lastNameKey(name: string) {
  const parts = name.trim().split(/\s+/);
  const last = parts.length > 1 ? parts[parts.length - 1] : parts[0] ?? '';
  return `${last} ${name}`.toLowerCase();
}

export default function DriverCombobox({
  operators,
  value,
  onChange,
  placeholder = 'Select a driver…',
  triggerClassName,
  size = 'md',
  emptyText = 'No drivers found.',
}: Props) {
  const [open, setOpen] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const sorted = useMemo(() => {
    return [...operators].sort((a, b) =>
      lastNameKey(a.name).localeCompare(lastNameKey(b.name), undefined, { sensitivity: 'base' })
    );
  }, [operators]);

  const hasInactive = useMemo(() => sorted.some(o => o.isActive === false), [sorted]);

  const visible = useMemo(() => {
    if (showInactive) return sorted;
    // Keep the current selection visible even if it is inactive.
    return sorted.filter(o => o.isActive !== false || o.userId === value);
  }, [sorted, showInactive, value]);

  const selected = sorted.find(op => op.userId === value);
  const isSm = size === 'sm';
  const showLegend = useMemo(() => sorted.some(o => o.status), [sorted]);

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
     <TooltipProvider delayDuration={150}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'justify-between font-normal',
            isSm ? 'h-8 text-xs px-3' : 'h-10 text-sm',
            !selected && 'text-muted-foreground',
            triggerClassName,
          )}
        >
          <span className="flex items-center gap-2 truncate">
            <User className={cn('shrink-0 text-muted-foreground', isSm ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
            <span className="truncate">
              {selected
                ? selected.unitNumber
                  ? `${selected.name} · Unit ${selected.unitNumber}`
                  : selected.name
                : placeholder}
            </span>
          </span>
          <ChevronsUpDown className={cn('shrink-0 opacity-50 ml-2', isSm ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[--radix-popover-trigger-width] min-w-[260px]" align="start">
        <Command
          filter={(itemValue, search) => {
            return itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Search name or unit #…" className="h-9" />
          {showLegend && (
            <div className="flex items-center gap-3 border-b border-border px-3 py-1.5 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1"><Check className="h-3 w-3 text-success" />Eligible</span>
              <span className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-warning" />Warnings</span>
              <span className="flex items-center gap-1"><XCircle className="h-3 w-3 text-destructive" />Blocked</span>
            </div>
          )}
          <CommandList className="overscroll-contain">
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {visible.map(op => (
                <CommandItem
                  key={op.userId}
                  value={`${op.name} ${op.unitNumber ?? ''} ${op.userId}`}
                  onSelect={() => {
                    onChange(op.userId);
                    setOpen(false);
                  }}
                  className="flex items-center gap-2"
                >
                  <Check
                    className={cn(
                      'h-4 w-4 shrink-0',
                      op.userId === value ? 'opacity-100 text-primary' : 'opacity-0',
                    )}
                  />
                  <span className="truncate">{op.name}</span>
                  <span className="ml-auto flex items-center gap-1.5 shrink-0 text-[11px] text-muted-foreground">
                    {op.isActive === false && <span className="italic">inactive</span>}
                    {op.unitNumber && <span className="font-mono">Unit {op.unitNumber}</span>}
                    {op.status && <StatusIndicator status={op.status} detail={op.statusDetail} />}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          {hasInactive && (
            <div className="border-t border-border p-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full h-7 justify-start gap-2 text-xs text-muted-foreground"
                onClick={() => setShowInactive(v => !v)}
              >
                {showInactive ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {showInactive ? 'Hide inactive drivers' : 'Show inactive drivers'}
              </Button>
            </div>
          )}
        </Command>
      </PopoverContent>
     </TooltipProvider>
    </Popover>
  );
}
