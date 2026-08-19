import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import FacilityDialog from '@/components/facilities/FacilityDialog';
import { FACILITIES_QUERY_KEY, useFacilities } from '@/hooks/useFacilities';
import type { Facility } from '@/lib/facilities';
import { cn } from '@/lib/utils';

interface Props {
  /** Currently linked facility id ('' when the stop is a one-off address). */
  facilityId: string;
  /** Free-text facility name held on the stop. */
  facilityName: string;
  onNameChange: (name: string) => void;
  onSelectFacility: (facility: Facility) => void;
  onClearFacility: () => void;
}

/**
 * Facility picker for a load stop. Typing searches saved facilities by name and
 * city (most used first) and also updates the stop's free-text facility name,
 * so a one-off address can still be typed without picking anything.
 */
export default function FacilitySelect({
  facilityId, facilityName, onNameChange, onSelectFacility, onClearFacility,
}: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const { data: facilities } = useFacilities();

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
            <span className={cn('truncate', !facilityName && 'text-muted-foreground')}>
              {facilityName || 'Search saved facilities or type a name…'}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[18rem] p-0 bg-popover z-50" align="start">
          <Command shouldFilter>
            <CommandInput
              value={facilityName}
              onValueChange={onNameChange}
              placeholder="Search or type a facility name…"
            />
            <CommandList>
              <CommandEmpty>No saved facility matches — the typed name is kept.</CommandEmpty>
              {facilityId && (
                <CommandGroup>
                  <CommandItem
                    value="__unlink__"
                    onSelect={() => { onClearFacility(); setOpen(false); }}
                    className="text-muted-foreground"
                  >
                    Unlink saved facility (keep typed address)
                  </CommandItem>
                </CommandGroup>
              )}
              <CommandGroup heading="Saved facilities">
                {(facilities ?? []).map(f => (
                  <CommandItem
                    key={f.id}
                    value={`${f.facility_name} ${f.city ?? ''} ${f.state ?? ''}`}
                    onSelect={() => { onSelectFacility(f); setOpen(false); }}
                  >
                    <Check className={cn('mr-2 h-4 w-4', facilityId === f.id ? 'opacity-100' : 'opacity-0')} />
                    <span className="truncate">{f.facility_name}</span>
                    <span className="ml-auto pl-2 text-xs text-muted-foreground truncate">
                      {[f.city, f.state].filter(Boolean).join(', ')}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandGroup>
                <CommandItem value="__add__" onSelect={() => { setOpen(false); setAddOpen(true); }}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add new facility
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <FacilityDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        initial={{ facility_name: facilityName }}
        onSaved={async facility => {
          await qc.invalidateQueries({ queryKey: FACILITIES_QUERY_KEY });
          onSelectFacility(facility);
        }}
      />
    </>
  );
}
