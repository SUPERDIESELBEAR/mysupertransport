import { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CA_PROVINCES, US_STATES, type RegionOption } from '@/lib/usStates';
import { cn } from '@/lib/utils';

interface Props {
  value: string;
  onChange: (code: string) => void;
  placeholder?: string;
  id?: string;
  'aria-invalid'?: boolean;
}

/** Searchable state / province picker storing the two-letter code. */
export default function StateSelect({ value, onChange, placeholder = 'Select state…', id }: Props) {
  const [open, setOpen] = useState(false);
  const all: RegionOption[] = [...US_STATES, ...CA_PROVINCES];
  const selected = all.find(r => r.code === (value ?? '').toUpperCase()) ?? null;

  const item = (r: RegionOption) => (
    <CommandItem
      key={`${r.code}-${r.name}`}
      value={`${r.name} ${r.code}`}
      onSelect={() => { onChange(r.code); setOpen(false); }}
    >
      <Check className={cn('mr-2 h-4 w-4', value?.toUpperCase() === r.code ? 'opacity-100' : 'opacity-0')} />
      <span className="truncate">{r.name}</span>
      <span className="ml-auto text-xs text-muted-foreground">{r.code}</span>
    </CommandItem>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className={cn('truncate', !selected && 'text-muted-foreground')}>
            {selected ? `${selected.name} (${selected.code})` : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[14rem] p-0 bg-popover z-50" align="start">
        <Command>
          <CommandInput placeholder="Search states…" />
          <CommandList>
            <CommandEmpty>No match.</CommandEmpty>
            <CommandGroup heading="United States">{US_STATES.map(item)}</CommandGroup>
            <CommandGroup heading="Canada">{CA_PROVINCES.map(item)}</CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
