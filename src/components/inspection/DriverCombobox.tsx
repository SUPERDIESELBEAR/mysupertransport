import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface DriverComboboxOption {
  userId: string;
  name: string;
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

  const sorted = useMemo(() => {
    return [...operators].sort((a, b) =>
      lastNameKey(a.name).localeCompare(lastNameKey(b.name), undefined, { sensitivity: 'base' })
    );
  }, [operators]);

  const selected = sorted.find(op => op.userId === value);
  const isSm = size === 'sm';

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
            <span className="truncate">{selected ? selected.name : placeholder}</span>
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
          <CommandInput placeholder="Search drivers…" className="h-9" />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {sorted.map(op => (
                <CommandItem
                  key={op.userId}
                  value={`${op.name} ${op.userId}`}
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
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}