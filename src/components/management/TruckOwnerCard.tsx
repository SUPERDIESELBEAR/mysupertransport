import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2, UserPlus, Send, Mail, Phone, Building2, CheckCircle2, Pencil } from 'lucide-react';
import { toast } from 'sonner';

interface TruckOwnerRecord {
  id: string;
  operator_id: string;
  user_id: string | null;
  legal_first_name: string;
  legal_last_name: string;
  business_name: string | null;
  email: string;
  phone: string | null;
  address_street: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip: string | null;
  invited_at: string | null;
  invite_accepted_at: string | null;
}

interface Props {
  operatorId: string;
}

const emptyForm = {
  legal_first_name: '',
  legal_last_name: '',
  business_name: '',
  email: '',
  phone: '',
  address_street: '',
  address_city: '',
  address_state: '',
  address_zip: '',
};

export default function TruckOwnerCard({ operatorId }: Props) {
  const [record, setRecord] = useState<TruckOwnerRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [inviting, setInviting] = useState(false);

  const fetchOwner = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('truck_owners')
      .select('*')
      .eq('operator_id', operatorId)
      .maybeSingle();
    setRecord((data as any) ?? null);
    setLoading(false);
  };

  useEffect(() => { fetchOwner(); }, [operatorId]);

  const openCreate = () => {
    setForm(emptyForm);
    setOpen(true);
  };
  const openEdit = () => {
    if (!record) return;
    setForm({
      legal_first_name: record.legal_first_name ?? '',
      legal_last_name: record.legal_last_name ?? '',
      business_name: record.business_name ?? '',
      email: record.email ?? '',
      phone: record.phone ?? '',
      address_street: record.address_street ?? '',
      address_city: record.address_city ?? '',
      address_state: record.address_state ?? '',
      address_zip: record.address_zip ?? '',
    });
    setOpen(true);
  };

  const handleSave = async (sendInvite: boolean) => {
    if (!form.legal_first_name || !form.legal_last_name || !form.email) {
      toast.error('First name, last name, and email are required.');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.functions.invoke('invite-truck-owner', {
        body: {
          operator_id: operatorId,
          legal_first_name: form.legal_first_name.trim(),
          legal_last_name: form.legal_last_name.trim(),
          business_name: form.business_name.trim() || null,
          email: form.email.trim().toLowerCase(),
          phone: form.phone.trim() || null,
          address_street: form.address_street.trim() || null,
          address_city: form.address_city.trim() || null,
          address_state: form.address_state.trim() || null,
          address_zip: form.address_zip.trim() || null,
          send_invite: sendInvite,
        },
      });
      if (error) throw error;
      toast.success(sendInvite ? 'Truck owner saved and invited.' : 'Truck owner saved.');
      setOpen(false);
      fetchOwner();
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to save truck owner');
    } finally {
      setSaving(false);
    }
  };

  const handleResend = async () => {
    if (!record) return;
    setInviting(true);
    try {
      const { error } = await supabase.functions.invoke('invite-truck-owner', {
        body: {
          operator_id: operatorId,
          legal_first_name: record.legal_first_name,
          legal_last_name: record.legal_last_name,
          business_name: record.business_name,
          email: record.email,
          phone: record.phone,
          address_street: record.address_street,
          address_city: record.address_city,
          address_state: record.address_state,
          address_zip: record.address_zip,
          send_invite: true,
        },
      });
      if (error) throw error;
      toast.success('Invite resent to truck owner.');
      fetchOwner();
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to resend invite');
    } finally {
      setInviting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 rounded-xl border border-border bg-surface flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading truck owner…
      </div>
    );
  }

  return (
    <>
      <div className="p-4 rounded-xl border border-border bg-surface">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-gold" />
            <h3 className="text-sm font-semibold text-foreground">Truck Owner</h3>
            {record?.invite_accepted_at && (
              <span className="inline-flex items-center gap-1 text-[11px] text-status-complete">
                <CheckCircle2 className="h-3 w-3" /> Accepted
              </span>
            )}
            {record?.invited_at && !record?.invite_accepted_at && (
              <span className="text-[11px] text-amber-600">Invited · awaiting acceptance</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!record ? (
              <Button size="sm" variant="outline" onClick={openCreate} className="gap-1.5">
                <UserPlus className="h-3.5 w-3.5" /> Add Truck Owner
              </Button>
            ) : (
              <>
                <Button size="sm" variant="ghost" onClick={openEdit} className="gap-1.5 text-muted-foreground">
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
                <Button size="sm" variant="outline" onClick={handleResend} disabled={inviting} className="gap-1.5">
                  {inviting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Resend Invite
                </Button>
              </>
            )}
          </div>
        </div>

        {record ? (
          <div className="mt-3 grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
            <div>
              <span className="text-foreground font-medium">{record.legal_first_name} {record.legal_last_name}</span>
              {record.business_name && <span className="text-muted-foreground"> — {record.business_name}</span>}
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Mail className="h-3 w-3" /> {record.email}
            </div>
            {record.phone && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Phone className="h-3 w-3" /> {record.phone}
              </div>
            )}
            {(record.address_street || record.address_city) && (
              <div className="text-muted-foreground text-xs">
                {[record.address_street, record.address_city, record.address_state, record.address_zip].filter(Boolean).join(', ')}
              </div>
            )}
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            If this truck is owned by a separate person or company, add them so they can sign the ICA and access SUPERDRIVE for this truck.
          </p>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{record ? 'Edit Truck Owner' : 'Add Truck Owner'}</DialogTitle>
          </DialogHeader>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="to_first">First name *</Label>
              <Input id="to_first" value={form.legal_first_name} onChange={(e) => setForm({ ...form, legal_first_name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="to_last">Last name *</Label>
              <Input id="to_last" value={form.legal_last_name} onChange={(e) => setForm({ ...form, legal_last_name: e.target.value })} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="to_biz">Business name (if any)</Label>
              <Input id="to_biz" value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="to_email">Email *</Label>
              <Input id="to_email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="to_phone">Phone</Label>
              <Input id="to_phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="to_street">Street address</Label>
              <Input id="to_street" value={form.address_street} onChange={(e) => setForm({ ...form, address_street: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="to_city">City</Label>
              <Input id="to_city" value={form.address_city} onChange={(e) => setForm({ ...form, address_city: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="to_state">State</Label>
              <Input id="to_state" maxLength={2} value={form.address_state} onChange={(e) => setForm({ ...form, address_state: e.target.value.toUpperCase() })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="to_zip">ZIP</Label>
              <Input id="to_zip" value={form.address_zip} onChange={(e) => setForm({ ...form, address_zip: e.target.value })} />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button variant="outline" onClick={() => handleSave(false)} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save without inviting'}
            </Button>
            <Button onClick={() => handleSave(true)} disabled={saving} className="bg-gold text-surface-dark hover:bg-gold-light gap-1.5">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Save & Send Invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}