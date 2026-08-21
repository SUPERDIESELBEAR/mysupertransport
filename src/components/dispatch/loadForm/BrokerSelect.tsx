import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import BrokerDialog from './BrokerDialog';

interface BrokerOption { id: string; company_name: string; mc_number: string | null }

interface Props {
  value: string;
  onChange: (id: string) => void;
  optional?: boolean;
  /** Broker name read off a parsed rate confirmation that is not yet a directory record. */
  provisionalName?: string | null;
}

export default function BrokerSelect({ value, onChange, optional, provisionalName }: Props) {
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const { data: brokers } = useQuery({
    queryKey: ['load-form-brokers'],
    queryFn: async (): Promise<BrokerOption[]> => {
      const { data, error } = await supabase
        .from('brokers')
        .select('id, company_name, mc_number')
        .order('company_name');
      if (error) throw error;
      return data ?? [];
    },
  });

  const selected = (brokers ?? []).find(b => b.id === value) ?? null;

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
          >
            <span className={cn('truncate', !selected && !provisionalName && 'text-muted-foreground')}>
              {selected
                ? selected.company_name
                : provisionalName
                  ? provisionalName
                  : optional ? 'Select a broker (optional)…' : 'Select a broker…'}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search brokers…" />
            <CommandList>
              <CommandEmpty>No brokers found.</CommandEmpty>
              <CommandGroup>
                {value && (
                  <CommandItem
                    value="__clear__"
                    onSelect={() => { onChange(''); setOpen(false); }}
                    className="text-muted-foreground"
                  >
                    Clear selection
                  </CommandItem>
                )}
                {(brokers ?? []).map(b => (
                  <CommandItem
                    key={b.id}
                    value={`${b.company_name} ${b.mc_number ?? ''}`}
                    onSelect={() => { onChange(b.id); setOpen(false); }}
                  >
                    <Check className={cn('mr-2 h-4 w-4', value === b.id ? 'opacity-100' : 'opacity-0')} />
                    <span className="truncate">{b.company_name}</span>
                    {b.mc_number && (
                      <span className="ml-auto text-xs text-muted-foreground">MC {b.mc_number}</span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandGroup>
                <CommandItem value="__add__" onSelect={() => { setOpen(false); setAddOpen(true); }}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add new broker
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {!value && provisionalName && (
        <p className="mt-1 text-xs text-warning">
          Read from the rate confirmation — not linked to a broker record yet. Create or select the broker.
        </p>
      )}

      <BrokerDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={id => { onChange(id); }}
        onUseExisting={id => { onChange(id); }}
      />
    </>
  );
}
