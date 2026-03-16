import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import TipTapEditor from './TipTapEditor';
import { DriverDocument, CATEGORIES } from './DocumentHubTypes';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

interface DocumentEditorModalProps {
  open: boolean;
  onClose: () => void;
  doc?: DriverDocument | null;
  onSaved: () => void;
}

const EMPTY_FORM = {
  title: '',
  description: '',
  category: 'General' as DriverDocument['category'],
  estimated_read_minutes: '',
  is_required: false,
  is_visible: false,
  is_pinned: false,
  body: '',
};

export default function DocumentEditorModal({ open, onClose, doc, onSaved }: DocumentEditorModalProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    if (doc) {
      setForm({
        title: doc.title,
        description: doc.description ?? '',
        category: doc.category,
        estimated_read_minutes: doc.estimated_read_minutes?.toString() ?? '',
        is_required: doc.is_required,
        is_visible: doc.is_visible,
        is_pinned: doc.is_pinned,
        body: doc.body ?? '',
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [doc, open]);

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast({ title: 'Title required', variant: 'destructive' });
      return;
    }
    setSaving(true);

    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      category: form.category,
      estimated_read_minutes: form.estimated_read_minutes ? parseInt(form.estimated_read_minutes) : null,
      is_required: form.is_required,
      is_visible: form.is_visible,
      is_pinned: form.is_pinned,
      body: form.body || null,
    };

    if (doc) {
      // Save version history first
      await supabase.from('document_version_history').insert({
        document_id: doc.id,
        version: doc.version,
        body: doc.body,
        updated_by: user?.id ?? null,
      });

      // Update document, increment version
      const { error } = await supabase
        .from('driver_documents')
        .update({ ...payload, version: doc.version + 1, updated_at: new Date().toISOString() })
        .eq('id', doc.id);

      if (error) {
        toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
        setSaving(false);
        return;
      }

      // Notify drivers who previously acknowledged this doc
      if (form.is_visible) {
        // Fetch all users who have acknowledged this doc
        const { data: acks } = await supabase
          .from('document_acknowledgments')
          .select('user_id')
          .eq('document_id', doc.id);

        if (acks && acks.length > 0) {
          const uniqueUserIds = [...new Set(acks.map(a => a.user_id))];
          await Promise.all(
            uniqueUserIds.map(uid =>
              supabase.from('notifications').insert({
                user_id: uid,
                title: `${doc.title} has been updated`,
                body: 'Please review and re-acknowledge this document in the Document Hub.',
                type: 'document_updated',
                channel: 'in_app',
                link: '/operator?tab=docs-hub',
              })
            )
          );
        }
      }

      toast({ title: 'Document updated ✓' });
    } else {
      const { data, error } = await supabase
        .from('driver_documents')
        .insert(payload)
        .select()
        .single();

      if (error) {
        toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
        setSaving(false);
        return;
      }

      // If visible on creation, notify all operators
      if (form.is_visible && data) {
        const { data: operators } = await supabase.from('operators').select('user_id');
        if (operators) {
          await Promise.all(
            operators.map(op =>
              supabase.from('notifications').insert({
                user_id: op.user_id,
                title: `New document available: ${form.title}`,
                body: 'A new document has been added to the Document Hub. Tap to view.',
                type: 'document_published',
                channel: 'in_app',
                link: '/operator?tab=docs-hub',
              })
            )
          );
        }
      }

      toast({ title: 'Document created ✓' });
    }

    setSaving(false);
    onSaved();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{doc ? 'Edit Document' : 'New Document'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="doc-title">Title *</Label>
            <Input
              id="doc-title"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Driver Safety Handbook"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="doc-desc">Short Description</Label>
            <Input
              id="doc-desc"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="One-line summary shown on the card"
            />
          </div>

          {/* Category + read time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="doc-cat">Category</Label>
              <select
                id="doc-cat"
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value as DriverDocument['category'] }))}
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-rt">Estimated Read Time (minutes)</Label>
              <Input
                id="doc-rt"
                type="number"
                min="1"
                value={form.estimated_read_minutes}
                onChange={e => setForm(f => ({ ...f, estimated_read_minutes: e.target.value }))}
                placeholder="e.g. 8"
              />
            </div>
          </div>

          {/* Toggles */}
          <div className="flex flex-wrap gap-6">
            {[
              { key: 'is_required', label: 'Required' },
              { key: 'is_visible', label: 'Visible to Drivers' },
              { key: 'is_pinned', label: 'Pinned' },
            ].map(({ key, label }) => (
              <div key={key} className="flex items-center gap-2">
                <Switch
                  id={key}
                  checked={form[key as keyof typeof form] as boolean}
                  onCheckedChange={v => setForm(f => ({ ...f, [key]: v }))}
                />
                <Label htmlFor={key} className="cursor-pointer">{label}</Label>
              </div>
            ))}
          </div>

          {/* Body */}
          <div className="space-y-1.5">
            <Label>Document Body</Label>
            {doc && (
              <p className="text-xs text-muted-foreground">
                Saving will increment the version to <strong>v{doc.version + 1}</strong> and prompt acknowledged drivers to re-read.
              </p>
            )}
            <TipTapEditor
              content={form.body}
              onChange={html => setForm(f => ({ ...f, body: html }))}
              placeholder="Paste content here or start writing…"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : doc ? 'Save Changes' : 'Create Document'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
