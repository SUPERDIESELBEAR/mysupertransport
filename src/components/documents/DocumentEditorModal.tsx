import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import TipTapEditor from './TipTapEditor';
import { DriverDocument, CATEGORIES, CATEGORY_COLORS } from './DocumentHubTypes';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { History, RotateCcw, Clock, User, Eye, AlertTriangle, BookOpen } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

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

interface VersionEntry {
  id: string;
  version: number;
  body: string | null;
  updated_at: string;
  updated_by: string | null;
  editor_name?: string;
}

export default function DocumentEditorModal({ open, onClose, doc, onSaved }: DocumentEditorModalProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [activeTab, setActiveTab] = useState('edit');

  // Version history state
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<VersionEntry | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [expandedVersion, setExpandedVersion] = useState<string | null>(null);

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
    // Reset tab to edit when modal reopens
    setActiveTab('edit');
    setVersions([]);
  }, [doc, open]);

  const loadVersionHistory = useCallback(async () => {
    if (!doc) return;
    setVersionsLoading(true);
    const { data, error } = await supabase
      .from('document_version_history')
      .select('*')
      .eq('document_id', doc.id)
      .order('version', { ascending: false });

    if (error || !data) {
      setVersionsLoading(false);
      return;
    }

    // Fetch editor names from profiles
    const editorIds = [...new Set(data.map(v => v.updated_by).filter(Boolean))] as string[];
    let profileMap: Record<string, string> = {};
    if (editorIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name')
        .in('user_id', editorIds);
      if (profiles) {
        profileMap = Object.fromEntries(
          profiles.map(p => [
            p.user_id,
            [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown',
          ])
        );
      }
    }

    setVersions(
      data.map(v => ({
        ...v,
        editor_name: v.updated_by ? (profileMap[v.updated_by] ?? 'Unknown') : 'System',
      }))
    );
    setVersionsLoading(false);
  }, [doc]);

  // Load history when switching to history tab
  useEffect(() => {
    if (activeTab === 'history' && doc) {
      loadVersionHistory();
    }
  }, [activeTab, doc, loadVersionHistory]);

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

      // Notify drivers who previously acknowledged this doc (in-app + email)
      if (form.is_visible) {
        const { data: acks } = await supabase
          .from('document_acknowledgments')
          .select('user_id')
          .eq('document_id', doc.id);

        if (acks && acks.length > 0) {
          const uniqueUserIds = [...new Set(acks.map(a => a.user_id))];
          // In-app notifications
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
          // Branded email notification (fire-and-forget)
          supabase.functions.invoke('notify-document-update', {
            body: {
              event_type: 'updated',
              document_title: form.title,
              document_description: form.description || undefined,
              acknowledged_user_ids: uniqueUserIds,
            },
          }).catch(e => console.warn('[notify-document-update] invoke error:', e));
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

      // If visible on creation, notify all operators (in-app + email)
      if (form.is_visible && data) {
        const { data: operators } = await supabase.from('operators').select('user_id');
        if (operators && operators.length > 0) {
          // In-app notifications
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
          // Branded email notification (fire-and-forget)
          supabase.functions.invoke('notify-document-update', {
            body: {
              event_type: 'published',
              document_title: form.title,
              document_description: form.description || undefined,
            },
          }).catch(e => console.warn('[notify-document-update] invoke error:', e));
        }
      }

      toast({ title: 'Document created ✓' });
    }

    setSaving(false);
    onSaved();
    onClose();
  };

  const handleRestore = async () => {
    if (!restoreTarget || !doc) return;
    setRestoring(true);

    // Archive the current body before restoring
    await supabase.from('document_version_history').insert({
      document_id: doc.id,
      version: doc.version,
      body: doc.body,
      updated_by: user?.id ?? null,
    });

    const { error } = await supabase
      .from('driver_documents')
      .update({
        body: restoreTarget.body,
        version: doc.version + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', doc.id);

    setRestoring(false);
    setRestoreTarget(null);

    if (error) {
      toast({ title: 'Restore failed', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: `Restored to v${restoreTarget.version} ✓` });
    onSaved();
    onClose();
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    }) + ' at ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>{doc ? 'Edit Document' : 'New Document'}</DialogTitle>
          </DialogHeader>

          {doc ? (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
              <TabsList className="shrink-0 w-full grid grid-cols-3">
                <TabsTrigger value="edit">Edit Content</TabsTrigger>
                <TabsTrigger value="preview" className="gap-1.5">
                  <Eye className="h-3.5 w-3.5" />
                  Preview
                </TabsTrigger>
                <TabsTrigger value="history" className="gap-1.5">
                  <History className="h-3.5 w-3.5" />
                  History
                  {versions.length > 0 && (
                    <Badge className="ml-1 h-4 px-1.5 text-[10px] bg-muted text-muted-foreground border-border">
                      {versions.length}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>

              {/* ── Edit tab ─────────────────────────────────────────── */}
              <TabsContent value="edit" className="flex-1 overflow-y-auto mt-0 pt-4">
                <EditForm
                  form={form}
                  setForm={setForm}
                  doc={doc}
                  saving={saving}
                  onSave={handleSave}
                  onClose={onClose}
                  initialBody={doc?.body ?? ''}
                />
              </TabsContent>

              {/* ── History tab ──────────────────────────────────────── */}
              <TabsContent value="history" className="flex-1 min-h-0 mt-0 pt-4">
                <ScrollArea className="h-[calc(90vh-200px)] pr-2">
                  {versionsLoading ? (
                    <div className="py-12 text-center text-muted-foreground text-sm animate-pulse">
                      Loading history…
                    </div>
                  ) : versions.length === 0 ? (
                    <div className="py-12 text-center text-muted-foreground text-sm">
                      <History className="h-8 w-8 mx-auto mb-3 opacity-30" />
                      <p>No version history yet.</p>
                      <p className="text-xs mt-1">History is recorded each time you save changes.</p>
                    </div>
                  ) : (
                    <div className="space-y-0 relative">
                      {/* Timeline line */}
                      <div className="absolute left-[19px] top-5 bottom-5 w-px bg-border" />

                      {versions.map((v) => (
                        <div key={v.id} className="relative pl-10 pb-5 last:pb-0">
                          {/* Dot */}
                          <div className="absolute left-3 top-1.5 h-3.5 w-3.5 rounded-full border-2 border-border bg-background" />

                          <div className="rounded-lg border border-border bg-card p-3 space-y-2">
                            {/* Header row */}
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-2">
                                  <Badge className="text-xs border bg-secondary text-secondary-foreground border-border">
                                    v{v.version}
                                  </Badge>
                                  <span className="text-xs font-medium text-foreground">
                                    Before this edit
                                  </span>
                                </div>
                                <div className="flex items-center gap-3 mt-1.5">
                                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <Clock className="h-3 w-3" />
                                    {formatDate(v.updated_at)}
                                  </span>
                                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <User className="h-3 w-3" />
                                    {v.editor_name}
                                  </span>
                                </div>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs gap-1 shrink-0"
                                onClick={() => setRestoreTarget(v)}
                              >
                                <RotateCcw className="h-3 w-3" />
                                Restore
                              </Button>
                            </div>

                            {/* Body preview toggle */}
                            {v.body ? (
                              <div>
                                <button
                                  type="button"
                                  className="text-xs text-primary underline-offset-2 hover:underline"
                                  onClick={() =>
                                    setExpandedVersion(expandedVersion === v.id ? null : v.id)
                                  }
                                >
                                  {expandedVersion === v.id ? 'Hide preview' : 'Show preview'}
                                </button>
                                {expandedVersion === v.id && (
                                  <div
                                    className="mt-2 p-3 rounded-md bg-secondary/30 border border-border text-xs prose prose-sm max-w-none max-h-52 overflow-y-auto"
                                    dangerouslySetInnerHTML={{ __html: v.body }}
                                  />
                                )}
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground italic">No body content in this version.</p>
                            )}
                          </div>
                        </div>
                      ))}

                      {/* Current version cap */}
                      <div className="relative pl-10 pb-1">
                        <div className="absolute left-3 top-1.5 h-3.5 w-3.5 rounded-full border-2 border-primary bg-primary/20" />
                        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                          <div className="flex items-center gap-2">
                            <Badge className="text-xs border bg-primary/10 text-primary border-primary/30">
                              v{doc.version} — Current
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              Latest saved version
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>
            </Tabs>
          ) : (
            /* New document — no history tab */
            <div className="flex-1 overflow-y-auto py-2">
              <EditForm
                form={form}
                setForm={setForm}
                doc={null}
                saving={saving}
                onSave={handleSave}
                onClose={onClose}
                initialBody=""
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Restore confirmation */}
      <AlertDialog open={!!restoreTarget} onOpenChange={o => { if (!o) setRestoreTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore v{restoreTarget?.version}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will replace the current body with the content from{' '}
              <strong>v{restoreTarget?.version}</strong> (saved {restoreTarget ? formatDate(restoreTarget.updated_at) : ''}).
              The current version will be archived in history first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoring}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestore} disabled={restoring}>
              {restoring ? 'Restoring…' : 'Yes, Restore'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Extracted edit form to avoid duplication ──────────────────────────────────

interface EditFormProps {
  form: typeof EMPTY_FORM;
  setForm: React.Dispatch<React.SetStateAction<typeof EMPTY_FORM>>;
  doc: DriverDocument | null;
  saving: boolean;
  onSave: () => void;
  onClose: () => void;
  initialBody: string;
}

function EditForm({ form, setForm, doc, saving, onSave, onClose, initialBody }: EditFormProps) {
  return (
    <div className="space-y-5 pb-2">
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
          key={doc ? `${doc.id}-${doc.version}` : 'new'}
          content={initialBody}
          onChange={html => setForm(f => ({ ...f, body: html }))}
          placeholder="Paste content here or start writing…"
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button onClick={onSave} disabled={saving}>
          {saving ? 'Saving…' : doc ? 'Save Changes' : 'Create Document'}
        </Button>
      </div>
    </div>
  );
}
