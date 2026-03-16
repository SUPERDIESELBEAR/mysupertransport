import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { Service } from './ServiceLibraryTypes';
import { Upload, X, Loader2 } from 'lucide-react';

interface ServiceFormModalProps {
  service?: Service | null;
  onClose: () => void;
  onSaved: (service: Service) => void;
}

export default function ServiceFormModal({ service, onClose, onSaved }: ServiceFormModalProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(service?.logo_url ?? null);
  const [form, setForm] = useState({
    name: service?.name ?? '',
    description: service?.description ?? '',
    support_phone: service?.support_phone ?? '',
    support_email: service?.support_email ?? '',
    support_chat_url: service?.support_chat_url ?? '',
    support_hours: service?.support_hours ?? '',
    known_issues_notes: service?.known_issues_notes ?? '',
    is_visible: service?.is_visible ?? false,
    is_new_driver_essential: service?.is_new_driver_essential ?? false,
    sort_order: service?.sort_order ?? 0,
  });

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast({ title: 'Service name is required', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      let logo_url = service?.logo_url ?? null;

      if (logoFile) {
        const ext = logoFile.name.split('.').pop();
        const path = `${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from('service-logos')
          .upload(path, logoFile, { upsert: true });
        if (uploadErr) throw uploadErr;
        const { data: urlData } = supabase.storage.from('service-logos').getPublicUrl(path);
        logo_url = urlData.publicUrl;
      }

      const payload = {
        ...form,
        name: form.name.trim(),
        description: form.description.trim() || null,
        support_phone: form.support_phone.trim() || null,
        support_email: form.support_email.trim() || null,
        support_chat_url: form.support_chat_url.trim() || null,
        support_hours: form.support_hours.trim() || null,
        known_issues_notes: form.known_issues_notes.trim() || null,
        logo_url,
      };

      if (service) {
        const { data, error } = await supabase.from('services').update(payload).eq('id', service.id).select().single();
        if (error) throw error;
        onSaved(data as Service);
      } else {
        const { data, error } = await supabase.from('services').insert(payload).select().single();
        if (error) throw error;
        onSaved(data as Service);
      }
      toast({ title: service ? 'Service updated ✓' : 'Service created ✓' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  return (
    <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{service ? 'Edit Service' : 'Add Service'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Logo */}
          <div className="space-y-1.5">
            <Label>Service Logo</Label>
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-xl bg-muted border border-border flex items-center justify-center overflow-hidden shrink-0">
                {logoPreview
                  ? <img src={logoPreview} alt="" className="h-full w-full object-contain" />
                  : <Upload className="h-6 w-6 text-muted-foreground" />
                }
              </div>
              <div className="flex-1">
                <input
                  type="file"
                  accept="image/*"
                  id="logo-upload"
                  className="sr-only"
                  onChange={handleLogoChange}
                />
                <label htmlFor="logo-upload">
                  <Button type="button" variant="outline" size="sm" asChild>
                    <span className="cursor-pointer gap-2 flex items-center">
                      <Upload className="h-3.5 w-3.5" />
                      {logoPreview ? 'Change Logo' : 'Upload Logo'}
                    </span>
                  </Button>
                </label>
                {logoPreview && (
                  <Button type="button" variant="ghost" size="sm" className="ml-2 text-destructive hover:text-destructive" onClick={() => { setLogoPreview(null); setLogoFile(null); }}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="name">Service Name *</Label>
            <Input id="name" value={form.name} onChange={set('name')} placeholder="e.g. Samsara ELD" required />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="desc">Description</Label>
            <Textarea id="desc" value={form.description} onChange={set('description')} placeholder="Brief description of this service" rows={2} />
          </div>

          <div className="border-t border-border pt-4 space-y-3">
            <p className="text-sm font-medium text-foreground">Support Contact</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="phone" className="text-xs">Phone</Label>
                <Input id="phone" value={form.support_phone} onChange={set('support_phone')} placeholder="+1 (800) 000-0000" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs">Email</Label>
                <Input id="email" type="email" value={form.support_email} onChange={set('support_email')} placeholder="support@example.com" />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label htmlFor="chat" className="text-xs">Live Chat URL</Label>
                <Input id="chat" value={form.support_chat_url} onChange={set('support_chat_url')} placeholder="https://…" />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label htmlFor="hours" className="text-xs">Support Hours</Label>
                <Input id="hours" value={form.support_hours} onChange={set('support_hours')} placeholder="Mon–Fri 8am–6pm CST" />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="issues">Tips & Known Issues</Label>
            <Textarea
              id="issues"
              value={form.known_issues_notes}
              onChange={set('known_issues_notes')}
              placeholder="Admin notes about known issues, tips, or workarounds — visible to drivers"
              rows={3}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sort">Sort Order</Label>
            <Input id="sort" type="number" value={form.sort_order} onChange={e => setForm(p => ({ ...p, sort_order: parseInt(e.target.value) || 0 }))} />
          </div>

          <div className="flex items-center justify-between border border-border rounded-lg px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">Visible to Drivers</p>
              <p className="text-xs text-muted-foreground">Show this service in the driver library</p>
            </div>
            <Switch checked={form.is_visible} onCheckedChange={v => setForm(p => ({ ...p, is_visible: v }))} />
          </div>

          <div className="flex items-center justify-between border border-border rounded-lg px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">New Driver Essential</p>
              <p className="text-xs text-muted-foreground">Feature in the essentials carousel for new drivers</p>
            </div>
            <Switch checked={form.is_new_driver_essential} onCheckedChange={v => setForm(p => ({ ...p, is_new_driver_essential: v }))} />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={saving} className="flex-1">
              {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving…</> : service ? 'Save Changes' : 'Create Service'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
