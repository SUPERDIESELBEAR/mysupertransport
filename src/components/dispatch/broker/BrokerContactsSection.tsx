import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Star, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { getDbErrorMessage } from '@/lib/dbError';
import { formatPhone, normalizePhone, normalizeWhitespace, toTitleCase } from '@/lib/textNormalize';
import {
  BROKER_CONTACT_ROLES, BROKER_CONTACT_ROLE_LABELS, type BrokerContactRole,
} from '@/lib/brokers';
import {
  deleteBrokerContact, fetchBrokerContacts, insertBrokerContact, type BrokerContact,
  type BrokerContactInput,
} from '@/lib/brokerRelationship';

interface Props { brokerId: string }

const emptyDraft: BrokerContactInput = {
  name: '', role: 'dispatch', phone: null, email: null, notes: null, is_primary: false,
};

export const brokerContactsQueryKey = (id: string) => ['broker-contacts', id] as const;

/**
 * Multiple contacts per broker, found by role — dispatch should not have to
 * call accounts payable about a load.
 */
export default function BrokerContactsSection({ brokerId }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<BrokerContactInput>(emptyDraft);

  const { data: contacts, isLoading, error } = useQuery({
    queryKey: brokerContactsQueryKey(brokerId),
    queryFn: () => fetchBrokerContacts(brokerId),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: brokerContactsQueryKey(brokerId) });

  const create = useMutation({
    mutationFn: () => insertBrokerContact(brokerId, {
      ...draft,
      name: toTitleCase(draft.name),
      phone: draft.phone ? normalizePhone(draft.phone) || null : null,
      email: draft.email ? normalizeWhitespace(draft.email).toLowerCase() || null : null,
      notes: draft.notes ? normalizeWhitespace(draft.notes) || null : null,
    }),
    onSuccess: async () => {
      await invalidate();
      setDraft(emptyDraft);
      setAdding(false);
      toast({ description: 'Contact added.' });
    },
    onError: (e: unknown) => toast({
      variant: 'destructive',
      title: 'Contact not saved',
      description: getDbErrorMessage(e, 'Could not save the contact.'),
    }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteBrokerContact(id),
    onSuccess: async () => { await invalidate(); toast({ description: 'Contact removed.' }); },
    onError: (e: unknown) => toast({
      variant: 'destructive',
      title: 'Contact not removed',
      description: getDbErrorMessage(e, 'Could not remove the contact.'),
    }),
  });

  const rows = contacts ?? [];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">Contacts</p>
        {!adding && (
          <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" />
            Add contact
          </Button>
        )}
      </div>

      {error && <p className="text-xs text-destructive">Could not load contacts.</p>}
      {isLoading && <p className="text-xs text-muted-foreground">Loading contacts…</p>}

      {!isLoading && rows.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No contacts yet. Add dispatch, accounts payable, claims, and after-hours lines so calls
          reach the right desk.
        </p>
      )}

      {rows.length > 0 && (
        <ul className="divide-y divide-border rounded-md border border-border">
          {rows.map((c: BrokerContact) => (
            <li key={c.id} className="flex items-start justify-between gap-2 px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                  <span className="truncate">{c.name}</span>
                  {c.is_primary && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] uppercase tracking-wide text-gold">
                      <Star className="h-3 w-3" aria-hidden />
                      Primary
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {[
                    BROKER_CONTACT_ROLE_LABELS[c.role],
                    c.phone ? formatPhone(c.phone) : null,
                    c.email,
                  ].filter(Boolean).join(' · ')}
                </p>
                {c.notes && <p className="mt-0.5 text-xs text-muted-foreground italic">{c.notes}</p>}
              </div>
              <Button
                type="button" size="icon" variant="ghost"
                className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                aria-label={`Remove contact ${c.name}`}
                onClick={() => remove.mutate(c.id)}
                disabled={remove.isPending}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="broker-contact-name">Name *</Label>
              <Input
                id="broker-contact-name"
                value={draft.name}
                onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                maxLength={120}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="broker-contact-role">Role</Label>
              <Select
                value={draft.role}
                onValueChange={v => setDraft(d => ({ ...d, role: v as BrokerContactRole }))}
              >
                <SelectTrigger id="broker-contact-role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BROKER_CONTACT_ROLES.map(r => (
                    <SelectItem key={r} value={r}>{BROKER_CONTACT_ROLE_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="broker-contact-phone">Phone</Label>
              <Input
                id="broker-contact-phone"
                type="tel"
                inputMode="tel"
                value={formatPhone(draft.phone ?? '')}
                onChange={e => setDraft(d => ({ ...d, phone: normalizePhone(e.target.value) }))}
                maxLength={14}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="broker-contact-email">Email</Label>
              <Input
                id="broker-contact-email"
                type="email"
                value={draft.email ?? ''}
                onChange={e => setDraft(d => ({ ...d, email: e.target.value }))}
                maxLength={200}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="broker-contact-notes">Notes</Label>
              <Textarea
                id="broker-contact-notes"
                rows={2}
                value={draft.notes ?? ''}
                onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="broker-contact-primary"
              checked={draft.is_primary}
              onCheckedChange={v => setDraft(d => ({ ...d, is_primary: v }))}
            />
            <Label htmlFor="broker-contact-primary" className="cursor-pointer text-xs">
              Primary contact for this broker
            </Label>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button" size="sm" variant="outline"
              onClick={() => { setAdding(false); setDraft(emptyDraft); }}
            >
              Cancel
            </Button>
            <Button
              type="button" size="sm"
              disabled={!draft.name.trim() || create.isPending}
              onClick={() => create.mutate()}
            >
              {create.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Save contact
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
