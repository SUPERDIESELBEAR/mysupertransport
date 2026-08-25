import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Pencil, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAuth } from '@/hooks/useAuth';
import { BROKERS_QUERY_KEY, useBrokers } from '@/hooks/useBrokers';
import { cn } from '@/lib/utils';
import BrokerDialog from './BrokerDialog';

interface Props {
  value: string;
  onChange: (id: string) => void;
  optional?: boolean;
  /** Broker name read off a parsed rate confirmation that is not yet a directory record. */
  provisionalName?: string | null;
}

export default function BrokerSelect({ value, onChange, optional, provisionalName }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const { isManagement, isDispatcher, isOnboardingStaff } = useAuth();
  /** Mirrors the brokers table write policies — UI affordance only, RLS still enforces. */
  const canEditDirectory = isManagement || isDispatcher || isOnboardingStaff;

  // Shared directory query: carries the full record plus load count, so the
  // dialog can be opened in edit mode without a second fetch.
  const { data: brokers } = useBrokers();

  const selected = (brokers ?? []).find(b => b.id === value) ?? null;

  return (
    <>
      <div className="flex items-center gap-1.5">
        <div className="min-w-0 flex-1">
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
        </div>
        {selected && canEditDirectory && (
          <Button
            type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0"
            onClick={() => setEditOpen(true)}
            aria-label={`Edit broker details for ${selected.company_name}`}
            title="Edit broker details"
            data-testid="broker-edit"
          >
            <Pencil className="h-4 w-4" />
          </Button>
        )}
      </div>
      {!value && provisionalName && (
        <p className="mt-1 text-xs text-warning">
          Read from the rate confirmation — not linked to a broker record yet. Create or select the broker.
        </p>
      )}
      {selected?.do_not_load && <BrokerDoNotLoadWarning broker={selected} />}


      <BrokerDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={id => { void qc.invalidateQueries({ queryKey: BROKERS_QUERY_KEY }); onChange(id); }}
        onUseExisting={id => { onChange(id); }}
      />

      {/* Correcting the selected broker in place. Deletion stays on the Brokers page. */}
      <BrokerDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        broker={selected}
        loadCount={selected?.load_count ?? 0}
        canDelete={false}
        onSaved={() => { void qc.invalidateQueries({ queryKey: BROKERS_QUERY_KEY }); }}
      />
    </>
  );
}
