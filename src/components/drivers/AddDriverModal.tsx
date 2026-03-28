import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useDemoMode } from '@/hooks/useDemoMode';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { UserPlus, Loader2, Truck } from 'lucide-react';
import DemoLockIcon from '@/components/DemoLockIcon';

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA',
  'ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK',
  'OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
];

interface AddDriverModalProps {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
}

const formatPhone = (value: string): string => {
  const digits = value.replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 3) return digits.length ? `(${digits}` : '';
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
};

const INITIAL_FORM = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  home_state: '',
  start_date: '',
  unit_number: '',
  cdl_number: '',
  cdl_state: '',
  cdl_expiration: '',
  medical_cert_expiration: '',
  truck_year: '',
  truck_make: '',
  truck_model: '',
  truck_vin: '',
  truck_plate: '',
  truck_plate_state: '',
  trailer_number: '',
  eld_serial_number: '',
  dash_cam_number: '',
  bestpass_number: '',
  fuel_card_number: '',
};

export default function AddDriverModal({ open, onClose, onAdded }: AddDriverModalProps) {
  const { session } = useAuth();
  const { toast } = useToast();
  const { guardDemo } = useDemoMode();
  const [saving, setSaving] = useState(false);
  const [isPreExisting, setIsPreExisting] = useState(true);
  const [form, setForm] = useState(INITIAL_FORM);

  const set = (key: keyof typeof form, val: string) => setForm(prev => ({ ...prev, [key]: val }));

  const handleSubmit = async () => {
    if (guardDemo()) return;
    if (!form.first_name || !form.last_name || !form.email) {
      toast({ title: 'Missing fields', description: 'First name, last name, and email are required.', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      // Check for existing non-draft application with same email
      const { data: existing } = await supabase
        .from('applications')
        .select('id')
        .eq('email', form.email.trim().toLowerCase())
        .eq('is_draft', false)
        .maybeSingle();

      if (existing) {
        toast({
          title: 'Email already in use',
          description: 'A driver with this email address already exists. Please use a different email.',
          variant: 'destructive',
        });
        setSaving(false);
        return;
      }

      // 1. Create a minimal application record
      const { data: app, error: appErr } = await supabase
        .from('applications')
        .insert({
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          email: form.email.trim().toLowerCase(),
          phone: form.phone.trim() || null,
          address_state: form.home_state || null,
          cdl_number: form.cdl_number.trim() || null,
          cdl_state: form.cdl_state || null,
          cdl_expiration: form.cdl_expiration || null,
          medical_cert_expiration: form.medical_cert_expiration || null,
          review_status: 'approved',
          is_draft: false,
        })
        .select('id')
        .single();

      if (appErr || !app) throw new Error(appErr?.message ?? 'Failed to create application record');

      // 2. Invite the user via the existing edge function
      const { data: inviteData, error: inviteErr } = await supabase.functions.invoke('invite-operator', {
        body: {
          application_id: app.id,
          reviewer_notes: isPreExisting ? 'Pre-existing operator added directly' : 'Manually added as active driver',
          skip_invite: isPreExisting,
        },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });

      if (inviteErr || inviteData?.error) {
        // Clean up the orphaned application so the user can retry
        await supabase.from('applications').delete().eq('id', app.id);
        throw new Error(inviteErr?.message || inviteData?.error);
      }

      // 3. Find the newly-created operator for post-invite setup
      const { data: operator } = await supabase
        .from('operators')
        .select('id')
        .eq('application_id', app.id)
        .maybeSingle();

      if (operator?.id) {
        // Update onboarding_status with unit number + equipment fields
        const onboardingUpdate: Record<string, string> = {};
        if (form.unit_number.trim()) onboardingUpdate.unit_number = form.unit_number.trim();
        if (form.eld_serial_number.trim()) onboardingUpdate.eld_serial_number = form.eld_serial_number.trim();
        if (form.dash_cam_number.trim()) onboardingUpdate.dash_cam_number = form.dash_cam_number.trim();
        if (form.bestpass_number.trim()) onboardingUpdate.bestpass_number = form.bestpass_number.trim();
        if (form.fuel_card_number.trim()) onboardingUpdate.fuel_card_number = form.fuel_card_number.trim();
        if (form.start_date) onboardingUpdate.go_live_date = form.start_date;

        if (Object.keys(onboardingUpdate).length > 0) {
          await supabase
            .from('onboarding_status')
            .update(onboardingUpdate)
            .eq('operator_id', operator.id);
        }

        // If truck info was provided, create an ICA contract record to hold it
        const hasTruckInfo = form.truck_year || form.truck_make || form.truck_model || form.truck_vin || form.truck_plate;
        if (hasTruckInfo) {
          await supabase
            .from('ica_contracts')
            .insert({
              operator_id: operator.id,
              truck_year: form.truck_year.trim() || null,
              truck_make: form.truck_make.trim() || null,
              truck_model: form.truck_model.trim() || null,
              truck_vin: form.truck_vin.trim() || null,
              truck_plate: form.truck_plate.trim() || null,
              truck_plate_state: form.truck_plate_state || null,
              trailer_number: form.trailer_number.trim() || null,
              status: 'complete',
            });
        }
      }

      toast({
        title: 'Driver added ✓',
        description: isPreExisting
          ? `${form.first_name} ${form.last_name} has been added to the Driver Hub.`
          : `${form.first_name} ${form.last_name} has been added and will receive a portal invite.`,
      });

      // Reset form
      setForm(INITIAL_FORM);
      setIsPreExisting(true);
      onAdded();
      onClose();
    } catch (err: unknown) {
      toast({
        title: 'Failed to add driver',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Add Active Driver
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Pre-existing toggle */}
          <div className="flex items-center justify-between rounded-lg border border-border p-3 bg-muted/30">
            <div className="space-y-0.5">
              <Label htmlFor="pre-existing-toggle" className="text-sm font-medium">Pre-existing operator</Label>
              <p className="text-xs text-muted-foreground">
                {isPreExisting
                  ? 'No portal invite will be sent. Driver is added directly to the roster.'
                  : 'A portal invite email will be sent to the driver.'}
              </p>
            </div>
            <Switch
              id="pre-existing-toggle"
              checked={isPreExisting}
              onCheckedChange={setIsPreExisting}
            />
          </div>

          {/* Name row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="add-first-name">First Name <span className="text-destructive">*</span></Label>
              <Input id="add-first-name" value={form.first_name} onChange={e => set('first_name', e.target.value)} placeholder="Jane" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-last-name">Last Name <span className="text-destructive">*</span></Label>
              <Input id="add-last-name" value={form.last_name} onChange={e => set('last_name', e.target.value)} placeholder="Smith" />
            </div>
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <Label htmlFor="add-email">Email Address <span className="text-destructive">*</span></Label>
            <Input id="add-email" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="jane@example.com" />
          </div>

          {/* Phone + Home State + Unit row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="add-phone">Phone</Label>
              <Input id="add-phone" type="tel" value={form.phone} onChange={e => set('phone', formatPhone(e.target.value))} placeholder="(555) 000-0000" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-home-state">Home State</Label>
              <Select value={form.home_state} onValueChange={v => set('home_state', v)}>
                <SelectTrigger id="add-home-state">
                  <SelectValue placeholder="State" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {US_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-unit">Unit #</Label>
              <Input id="add-unit" value={form.unit_number} onChange={e => set('unit_number', e.target.value)} placeholder="e.g. 1042" />
            </div>
          </div>

          {/* Start Date (Anniversary) */}
          <div className="space-y-1.5">
            <Label htmlFor="add-start-date">Start Date (Anniversary)</Label>
            <Input id="add-start-date" type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
          </div>

          <hr className="border-border" />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">CDL &amp; Compliance</p>

          {/* CDL */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="add-cdl">CDL Number</Label>
              <Input id="add-cdl" value={form.cdl_number} onChange={e => set('cdl_number', e.target.value)} placeholder="CDL#" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-cdl-state">CDL State</Label>
              <Select value={form.cdl_state} onValueChange={v => set('cdl_state', v)}>
                <SelectTrigger id="add-cdl-state">
                  <SelectValue placeholder="State" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {US_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Expiry dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="add-cdl-exp">CDL Expiration</Label>
              <Input id="add-cdl-exp" type="date" value={form.cdl_expiration} onChange={e => set('cdl_expiration', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-med-exp">Med Cert Expiration</Label>
              <Input id="add-med-exp" type="date" value={form.medical_cert_expiration} onChange={e => set('medical_cert_expiration', e.target.value)} />
            </div>
          </div>

          <hr className="border-border" />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Truck className="h-3.5 w-3.5" />
            Truck Information
          </p>

          {/* Truck Year / Make / Model */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="add-truck-year">Year</Label>
              <Input id="add-truck-year" value={form.truck_year} onChange={e => set('truck_year', e.target.value)} placeholder="2022" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-truck-make">Make</Label>
              <Input id="add-truck-make" value={form.truck_make} onChange={e => set('truck_make', e.target.value)} placeholder="Freightliner" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-truck-model">Model</Label>
              <Input id="add-truck-model" value={form.truck_model} onChange={e => set('truck_model', e.target.value)} placeholder="Cascadia" />
            </div>
          </div>

          {/* VIN */}
          <div className="space-y-1.5">
            <Label htmlFor="add-truck-vin">VIN</Label>
            <Input id="add-truck-vin" value={form.truck_vin} onChange={e => set('truck_vin', e.target.value)} placeholder="1FUJGLDR0CLBP8834" />
          </div>

          {/* Plate + State + Trailer */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="add-truck-plate">Plate #</Label>
              <Input id="add-truck-plate" value={form.truck_plate} onChange={e => set('truck_plate', e.target.value)} placeholder="ABC1234" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-truck-plate-state">Plate State</Label>
              <Select value={form.truck_plate_state} onValueChange={v => set('truck_plate_state', v)}>
                <SelectTrigger id="add-truck-plate-state">
                  <SelectValue placeholder="State" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {US_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-trailer">Trailer #</Label>
              <Input id="add-trailer" value={form.trailer_number} onChange={e => set('trailer_number', e.target.value)} placeholder="T-001" />
            </div>
          </div>

          <hr className="border-border" />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Equipment &amp; Cards</p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="add-eld">ELD Serial #</Label>
              <Input id="add-eld" value={form.eld_serial_number} onChange={e => set('eld_serial_number', e.target.value)} placeholder="ELD serial" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-dashcam">Dash Cam #</Label>
              <Input id="add-dashcam" value={form.dash_cam_number} onChange={e => set('dash_cam_number', e.target.value)} placeholder="Dash cam #" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="add-bestpass">BestPass #</Label>
              <Input id="add-bestpass" value={form.bestpass_number} onChange={e => set('bestpass_number', e.target.value)} placeholder="BestPass #" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-fuelcard">Fuel Card #</Label>
              <Input id="add-fuelcard" value={form.fuel_card_number} onChange={e => set('fuel_card_number', e.target.value)} placeholder="Fuel card #" />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            <DemoLockIcon />
            Add Driver
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
