import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface BrokerOption { id: string; company_name: string; mc_number: string | null }

interface Props {
  value: string;
  onChange: (id: string) => void;
  optional?: boolean;
}

export default function BrokerSelect({ value, onChange, optional }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ company_name: '', mc_number: '', primary_contact_name: '' });

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

  const saveBroker = async () => {
    const name = form.company_name.trim();
    if (!name) {
      toast({ variant: 'destructive', description: 'Company name is required.' });
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from('brokers')
      .insert({
        company_name: name,
        mc_number: form.mc_number.trim() || null,
        primary_contact_name: form.primary_contact_name.trim() || null,
      })
      .select('id, company_name, mc_number')
      .single();
    setSaving(false);
    if (error || !data) {
      toast({ variant: 'destructive', description: error?.message ?? 'Could not add the broker.' });
      return;
    }
    await qc.invalidateQueries({ queryKey: ['load-form-brokers'] });
    onChange(data.id);
    setAddOpen(false);
    setForm({ company_name: '', mc_number: '', primary_contact_name: '' });
    toast({ description: `${data.company_name} added.` });
  };

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
            <span className={cn('truncate', !selected && 'text-muted-foreground')}>
              {selected ? selected.company_name : optional ? 'Select a broker (optional)…' : 'Select a broker…'}
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

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add new broker</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-broker-name">Company name</Label>
              <Input
                id="new-broker-name"
                value={form.company_name}
                onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))}
                maxLength={200}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-broker-mc">MC number</Label>
              <Input
                id="new-broker-mc"
                value={form.mc_number}
                onChange={e => setForm(f => ({ ...f, mc_number: e.target.value }))}
                maxLength={40}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-broker-contact">Primary contact</Label>
              <Input
                id="new-broker-contact"
                value={form.primary_contact_name}
                onChange={e => setForm(f => ({ ...f, primary_contact_name: e.target.value }))}
                maxLength={120}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button type="button" onClick={saveBroker} disabled={saving}>
              {saving ? 'Saving…' : 'Add broker'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
