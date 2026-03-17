import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import TipTapEditor from '@/components/documents/TipTapEditor';
import type { ServiceResource, ResourceType } from './ServiceLibraryTypes';
import { ALL_RESOURCE_TYPES } from './ServiceLibraryTypes';
import { parseVideoEmbedUrl } from '@/components/documents/DocumentHubTypes';
import { Loader2 } from 'lucide-react';

interface ResourceFormModalProps {
  resource?: ServiceResource | null;
  serviceId: string;
  onClose: () => void;
  onSaved: (resource: ServiceResource) => void;
}

export default function ResourceFormModal({ resource, serviceId, onClose, onSaved }: ResourceFormModalProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: resource?.title ?? '',
    description: resource?.description ?? '',
    resource_type: (resource?.resource_type ?? 'Setup Guide') as ResourceType,
    url: resource?.url ?? '',
    body: resource?.body ?? '',
    is_start_here: resource?.is_start_here ?? false,
    is_visible: resource?.is_visible ?? true,
    estimated_minutes: resource?.estimated_minutes?.toString() ?? '',
    sort_order: resource?.sort_order ?? 0,
  });

  const useBody = ['Setup Guide', 'FAQ'].includes(form.resource_type) || (!form.url && form.resource_type !== 'External Link');
  const showUrl = ['Tutorial Video', 'PDF', 'External Link', 'Contact & Support'].includes(form.resource_type);
  const showBody = ['Setup Guide', 'FAQ', 'External Link', 'Contact & Support'].includes(form.resource_type);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { toast({ title: 'Title is required', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const payload = {
        service_id: serviceId,
        title: form.title.trim(),
        description: form.description.trim() || null,
        resource_type: form.resource_type,
        url: form.url.trim() || null,
        body: form.body.trim() || null,
        is_start_here: form.is_start_here,
        is_visible: form.is_visible,
        estimated_minutes: form.estimated_minutes ? parseInt(form.estimated_minutes) : null,
        sort_order: form.sort_order,
      };

      if (resource) {
        const { data, error } = await supabase.from('service_resources').update(payload).eq('id', resource.id).select().single();
        if (error) throw error;
        onSaved(data as ServiceResource);
      } else {
        const { data, error } = await supabase.from('service_resources').insert(payload).select().single();
        if (error) throw error;
        onSaved(data as ServiceResource);
      }
      toast({ title: resource ? 'Resource updated ✓' : 'Resource created ✓' });
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{resource ? 'Edit Resource' : 'Add Resource'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="title">Title *</Label>
              <Input id="title" value={form.title} onChange={set('title')} placeholder="Resource title" required />
            </div>

            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="rdesc">Description</Label>
              <Textarea id="rdesc" value={form.description} onChange={set('description')} placeholder="Brief description" rows={2} />
            </div>

            <div className="space-y-1.5">
              <Label>Resource Type *</Label>
              <Select
                value={form.resource_type}
                onValueChange={v => setForm(p => ({ ...p, resource_type: v as ResourceType }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_RESOURCE_TYPES.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="mins">Estimated Minutes</Label>
              <Input id="mins" type="number" value={form.estimated_minutes} onChange={set('estimated_minutes')} placeholder="e.g. 5" min={1} />
            </div>
          </div>

          {showUrl && (
            <div className="space-y-1.5">
              <Label htmlFor="url">
                {form.resource_type === 'Tutorial Video' ? 'YouTube or Vimeo URL' :
                 form.resource_type === 'PDF' ? 'PDF URL' :
                 form.resource_type === 'External Link' ? 'External Link URL' :
                 'URL (optional)'}
              </Label>
              <Input
                id="url"
                value={form.url}
                onChange={set('url')}
                placeholder={
                  form.resource_type === 'Tutorial Video'
                    ? 'https://youtube.com/watch?v=… or https://vimeo.com/…'
                    : 'https://…'
                }
              />
              {/* Live video preview */}
              {form.resource_type === 'Tutorial Video' && (() => {
                const embedUrl = form.url ? parseVideoEmbedUrl(form.url) : null;
                if (!embedUrl) return null;
                return (
                  <div className="mt-2 rounded-xl overflow-hidden border border-border aspect-video w-full">
                    <iframe
                      src={embedUrl}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="w-full h-full"
                      title="Video preview"
                    />
                  </div>
                );
              })()}
            </div>
          )}

          {showBody && (
            <div className="space-y-1.5">
              <Label>
                {form.resource_type === 'Setup Guide' || form.resource_type === 'FAQ'
                  ? 'Content (Rich Text)'
                  : 'Additional Notes (optional)'}
              </Label>
              <TipTapEditor
                content={form.body}
                onChange={v => setForm(p => ({ ...p, body: v }))}
                placeholder={
                  form.resource_type === 'Setup Guide'
                    ? 'Write setup instructions here…'
                    : 'Add notes or context…'
                }
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="sortorder">Sort Order</Label>
            <Input id="sortorder" type="number" value={form.sort_order} onChange={e => setForm(p => ({ ...p, sort_order: parseInt(e.target.value) || 0 }))} />
          </div>

          <div className="flex gap-4">
            <div className="flex items-center justify-between border border-border rounded-lg px-4 py-3 flex-1">
              <div>
                <p className="text-sm font-medium text-foreground">Visible to Drivers</p>
              </div>
              <Switch checked={form.is_visible} onCheckedChange={v => setForm(p => ({ ...p, is_visible: v }))} />
            </div>
            <div className="flex items-center justify-between border border-border rounded-lg px-4 py-3 flex-1">
              <div>
                <p className="text-sm font-medium text-foreground">⭐ Start Here</p>
                <p className="text-xs text-muted-foreground">Add to Getting Started checklist</p>
              </div>
              <Switch checked={form.is_start_here} onCheckedChange={v => setForm(p => ({ ...p, is_start_here: v }))} />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={saving} className="flex-1">
              {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving…</> : resource ? 'Save Changes' : 'Create Resource'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
