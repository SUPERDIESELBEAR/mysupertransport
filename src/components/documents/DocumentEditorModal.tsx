import { useState, useEffect, useCallback, useRef } from 'react';
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
import {
  History, RotateCcw, Clock, User, Eye, AlertTriangle, BookOpen,
  FileText, Upload, X, File, ExternalLink,
} from 'lucide-react';
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
  content_type: 'rich_text' as 'rich_text' | 'pdf',
  pdf_url: null as string | null,
  pdf_path: null as string | null,
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

  // PDF upload state
  const [pdfUploading, setPdfUploading] = useState(false);
  const [pendingPdfFile, setPendingPdfFile] = useState<File | null>(null);
  const [pendingPdfUrl, setPendingPdfUrl] = useState<string | null>(null);
  const [pendingPdfPath, setPendingPdfPath] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        content_type: doc.content_type ?? 'rich_text',
        pdf_url: doc.pdf_url ?? null,
        pdf_path: doc.pdf_path ?? null,
      });
    } else {
      setForm(EMPTY_FORM);
    }
    setActiveTab('edit');
    setVersions([]);
    setPendingPdfFile(null);
    setPendingPdfUrl(null);
    setPendingPdfPath(null);
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

  useEffect(() => {
    if (activeTab === 'history' && doc) {
      loadVersionHistory();
    }
  }, [activeTab, doc, loadVersionHistory]);

  // ── PDF upload helpers ─────────────────────────────────────────────────────

  const uploadPdf = async (file: File) => {
    if (file.type !== 'application/pdf') {
      toast({ title: 'Only PDF files are accepted', variant: 'destructive' });
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Maximum PDF size is 20 MB.', variant: 'destructive' });
      return;
    }
    setPdfUploading(true);
    const ext = 'pdf';
    const path = `doc-hub-pdfs/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { data, error } = await supabase.storage
      .from('resource-library')
      .upload(path, file, { contentType: 'application/pdf', upsert: false });

    if (error || !data) {
      toast({ title: 'Upload failed', description: error?.message, variant: 'destructive' });
      setPdfUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from('resource-library').getPublicUrl(data.path);
    setPendingPdfFile(file);
    setPendingPdfUrl(urlData.publicUrl);
    setPendingPdfPath(data.path);
    setPdfUploading(false);
  };

  const removePdf = async () => {
    // If there's a newly uploaded pending PDF, delete it from storage
    if (pendingPdfPath) {
      await supabase.storage.from('resource-library').remove([pendingPdfPath]);
    }
    setPendingPdfFile(null);
    setPendingPdfUrl(null);
    setPendingPdfPath(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadPdf(file);
  };

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast({ title: 'Title required', variant: 'destructive' });
      return;
    }
    if (form.content_type === 'pdf' && !pendingPdfUrl && !form.pdf_url) {
      toast({ title: 'Please upload a PDF file', variant: 'destructive' });
      return;
    }
    setSaving(true);

    // Determine final PDF fields
    const finalPdfUrl  = pendingPdfUrl  ?? form.pdf_url;
    const finalPdfPath = pendingPdfPath ?? form.pdf_path;

    // If switching to rich_text, clear PDF fields; if switching to pdf, clear body
    const finalBody    = form.content_type === 'rich_text' ? (form.body || null) : null;

    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      category: form.category,
      estimated_read_minutes: form.estimated_read_minutes ? parseInt(form.estimated_read_minutes) : null,
      is_required: form.is_required,
      is_visible: form.is_visible,
      is_pinned: form.is_pinned,
      body: finalBody,
      content_type: form.content_type,
      pdf_url:  form.content_type === 'pdf' ? finalPdfUrl  : null,
      pdf_path: form.content_type === 'pdf' ? finalPdfPath : null,
    };

    if (doc) {
      // If we have a new PDF and there was an old one, delete the old one
      if (pendingPdfPath && doc.pdf_path && pendingPdfPath !== doc.pdf_path) {
        await supabase.storage.from('resource-library').remove([doc.pdf_path]);
      }
      // If switching away from PDF, delete old PDF file
      if (form.content_type === 'rich_text' && doc.pdf_path) {
        await supabase.storage.from('resource-library').remove([doc.pdf_path]);
      }

      // Archive current version
      await supabase.from('document_version_history').insert({
        document_id: doc.id,
        version: doc.version,
        body: doc.body,
        updated_by: user?.id ?? null,
      });

      const { error } = await supabase
        .from('driver_documents')
        .update({ ...payload, version: doc.version + 1, updated_at: new Date().toISOString() })
        .eq('id', doc.id);

      if (error) {
        toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
        setSaving(false);
        return;
      }

      // Notify acknowledged drivers
      if (form.is_visible) {
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

      if (form.is_visible && data) {
        const { data: operators } = await supabase.from('operators').select('user_id');
        if (operators && operators.length > 0) {
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

  // Derive the currently shown PDF (pending upload takes priority over existing)
  const shownPdfName = pendingPdfFile?.name ?? (form.pdf_url ? form.pdf_path?.split('/').pop() ?? 'existing.pdf' : null);
  const shownPdfUrl  = pendingPdfUrl ?? form.pdf_url ?? null;
  const hasPdf = !!pendingPdfUrl || !!form.pdf_url;

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
                  // PDF props
                  pdfUploading={pdfUploading}
                  pendingPdfFile={pendingPdfFile}
                  hasPdf={hasPdf}
                  shownPdfName={shownPdfName}
                  shownPdfUrl={shownPdfUrl}
                  dragOver={dragOver}
                  fileInputRef={fileInputRef}
                  onUploadPdf={uploadPdf}
                  onRemovePdf={removePdf}
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                />
              </TabsContent>

              {/* ── Preview tab ──────────────────────────────────────── */}
              <TabsContent value="preview" className="flex-1 min-h-0 mt-0 pt-4">
                <ScrollArea className="h-[calc(90vh-200px)] pr-2">
                  <div className="max-w-2xl mx-auto pb-8">
                    {/* Driver-facing header replica */}
                    <div className="mb-6">
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        <Badge className={`text-xs border font-medium ${CATEGORY_COLORS[form.category as DriverDocument['category']] ?? ''}`}>
                          {form.category}
                        </Badge>
                        {form.is_required && (
                          <Badge className="text-xs border bg-destructive/10 text-destructive border-destructive/30 font-medium gap-1">
                            <AlertTriangle className="h-3 w-3" /> Required
                          </Badge>
                        )}
                        {form.content_type === 'pdf' && (
                          <Badge className="text-xs border bg-secondary text-secondary-foreground border-border font-medium gap-1">
                            <FileText className="h-3 w-3" /> PDF
                          </Badge>
                        )}
                        {!form.is_visible && (
                          <Badge className="text-xs border bg-muted text-muted-foreground border-border gap-1">
                            <Eye className="h-3 w-3 opacity-50" /> Hidden from drivers
                          </Badge>
                        )}
                      </div>
                      <h1 className="text-2xl font-bold text-foreground mb-2">
                        {form.title || <span className="text-muted-foreground italic">Untitled document</span>}
                      </h1>
                      {form.description && (
                        <p className="text-muted-foreground text-base leading-relaxed mb-3">{form.description}</p>
                      )}
                      {form.estimated_read_minutes && (
                        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <Clock className="h-4 w-4" />
                          ~{form.estimated_read_minutes} min read
                        </span>
                      )}
                    </div>

                    <hr className="border-border mb-8" />

                    {/* Rendered body or PDF preview */}
                    {form.content_type === 'pdf' ? (
                      (pendingPdfUrl || form.pdf_url) ? (
                        <div className="rounded-xl overflow-hidden border border-border">
                          <iframe
                            src={pendingPdfUrl ?? form.pdf_url ?? ''}
                            title="PDF Preview"
                            className="w-full"
                            style={{ height: '500px' }}
                          />
                        </div>
                      ) : (
                        <div className="py-12 text-center text-muted-foreground">
                          <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
                          <p>Upload a PDF to see a preview here.</p>
                        </div>
                      )
                    ) : form.body ? (
                      <div
                        className="prose prose-sm max-w-none text-foreground
                          prose-headings:font-bold prose-headings:text-foreground
                          prose-h1:text-xl prose-h2:text-lg prose-h3:text-base
                          prose-p:text-foreground prose-p:leading-relaxed
                          prose-li:text-foreground prose-li:leading-relaxed
                          prose-blockquote:border-l-4 prose-blockquote:border-gold/40 prose-blockquote:text-muted-foreground prose-blockquote:pl-4 prose-blockquote:italic
                          prose-hr:border-border
                          prose-strong:text-foreground prose-strong:font-semibold
                          [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
                        dangerouslySetInnerHTML={{ __html: form.body }}
                      />
                    ) : (
                      <div className="py-12 text-center text-muted-foreground">
                        <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
                        <p>No content yet — switch to Edit Content to start writing.</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
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
                pdfUploading={pdfUploading}
                pendingPdfFile={pendingPdfFile}
                hasPdf={hasPdf}
                shownPdfName={shownPdfName}
                shownPdfUrl={shownPdfUrl}
                dragOver={dragOver}
                fileInputRef={fileInputRef}
                onUploadPdf={uploadPdf}
                onRemovePdf={removePdf}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
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

// ── Extracted edit form ────────────────────────────────────────────────────────

interface EditFormProps {
  form: typeof EMPTY_FORM;
  setForm: React.Dispatch<React.SetStateAction<typeof EMPTY_FORM>>;
  doc: DriverDocument | null;
  saving: boolean;
  onSave: () => void;
  onClose: () => void;
  initialBody: string;
  // PDF props
  pdfUploading: boolean;
  pendingPdfFile: File | null;
  hasPdf: boolean;
  shownPdfName: string | null;
  shownPdfUrl: string | null;
  dragOver: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onUploadPdf: (f: File) => void;
  onRemovePdf: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
}

function EditForm({
  form, setForm, doc, saving, onSave, onClose, initialBody,
  pdfUploading, pendingPdfFile, hasPdf, shownPdfName, shownPdfUrl,
  dragOver, fileInputRef, onUploadPdf, onRemovePdf,
  onDragOver, onDragLeave, onDrop,
}: EditFormProps) {
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

      {/* ── Content Type toggle ─────────────────────────────────────── */}
      <div className="space-y-3">
        <Label>Content Type</Label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setForm(f => ({ ...f, content_type: 'rich_text' }))}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
              form.content_type === 'rich_text'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-muted-foreground border-border hover:bg-muted/50'
            }`}
          >
            <BookOpen className="h-4 w-4" />
            Rich Text
          </button>
          <button
            type="button"
            onClick={() => setForm(f => ({ ...f, content_type: 'pdf' }))}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
              form.content_type === 'pdf'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-muted-foreground border-border hover:bg-muted/50'
            }`}
          >
            <FileText className="h-4 w-4" />
            PDF Upload
          </button>
        </div>
      </div>

      {/* ── Content area ────────────────────────────────────────────── */}
      {form.content_type === 'rich_text' ? (
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
      ) : (
        <div className="space-y-1.5">
          <Label>PDF File</Label>
          {doc && (
            <p className="text-xs text-muted-foreground">
              Saving will increment the version to <strong>v{doc.version + 1}</strong> and prompt acknowledged drivers to re-read.
            </p>
          )}

          {hasPdf ? (
            /* Uploaded PDF indicator */
            <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30">
              <File className="h-8 w-8 text-destructive shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {shownPdfName ?? 'document.pdf'}
                </p>
                <div className="flex items-center gap-3 mt-0.5">
                  <p className="text-xs text-muted-foreground">
                    {pendingPdfFile ? `${(pendingPdfFile.size / 1024 / 1024).toFixed(1)} MB — ready to save` : 'Currently attached'}
                  </p>
                  {shownPdfUrl && (
                    <a
                      href={shownPdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors font-medium"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Open in new tab
                    </a>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={onRemovePdf}
                className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="Remove PDF"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            /* Drop zone */
            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
                dragOver
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-muted/20 hover:bg-muted/40 hover:border-muted-foreground/40'
              }`}
            >
              {pdfUploading ? (
                <>
                  <Upload className="h-8 w-8 text-muted-foreground animate-bounce" />
                  <p className="text-sm text-muted-foreground">Uploading…</p>
                </>
              ) : (
                <>
                  <FileText className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm font-medium text-foreground">Drop PDF here or click to browse</p>
                  <p className="text-xs text-muted-foreground">PDF files only · max 20 MB</p>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) onUploadPdf(file);
                }}
              />
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button onClick={onSave} disabled={saving || pdfUploading}>
          {saving ? 'Saving…' : pdfUploading ? 'Uploading PDF…' : doc ? 'Save Changes' : 'Create Document'}
        </Button>
      </div>
    </div>
  );
}
