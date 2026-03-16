import { useState } from 'react';
import { Edit2, Trash2, GripVertical, Eye, EyeOff, AlertTriangle, CheckCircle2, Pin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { DriverDocument, CATEGORY_COLORS } from './DocumentHubTypes';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface AdminDocumentListProps {
  documents: DriverDocument[];
  ackCounts: Record<string, number>;
  totalDrivers: number;
  onEdit: (doc: DriverDocument) => void;
  onRefresh: () => void;
}

export default function AdminDocumentList({ documents, ackCounts, totalDrivers, onEdit, onRefresh }: AdminDocumentListProps) {
  const { toast } = useToast();
  const [deleteTarget, setDeleteTarget] = useState<DriverDocument | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  const handleToggle = async (doc: DriverDocument, field: 'is_visible' | 'is_required' | 'is_pinned') => {
    const newVal = !doc[field];
    setToggling(`${doc.id}-${field}`);

    const { error } = await supabase
      .from('driver_documents')
      .update({ [field]: newVal })
      .eq('id', doc.id);

    setToggling(null);

    if (error) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
      return;
    }

    // If making visible for the first time, notify operators
    if (field === 'is_visible' && newVal) {
      const { data: operators } = await supabase.from('operators').select('user_id');
      if (operators) {
        await Promise.all(
          operators.map(op =>
            supabase.from('notifications').insert({
              user_id: op.user_id,
              title: `New document available: ${doc.title}`,
              body: 'A new document has been added to the Document Hub. Tap to view.',
              type: 'document_published',
              channel: 'in_app',
              link: '/operator?tab=docs-hub',
            })
          )
        );
      }
    }

    const labels: Record<string, string> = {
      is_visible: newVal ? 'Visible to drivers' : 'Hidden from drivers',
      is_required: newVal ? 'Marked as required' : 'No longer required',
      is_pinned: newVal ? 'Pinned' : 'Unpinned',
    };
    toast({ title: labels[field] });
    onRefresh();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from('driver_documents').delete().eq('id', deleteTarget.id);
    setDeleteTarget(null);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Document deleted' });
    onRefresh();
  };

  if (documents.length === 0) {
    return (
      <div className="py-16 text-center text-muted-foreground">
        <CheckCircle2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p>No documents yet. Click "New Document" to create one.</p>
      </div>
    );
  }

  return (
    <>
      <div className="divide-y divide-border">
        {documents.map(doc => {
          const ackCount = ackCounts[doc.id] ?? 0;
          return (
            <div key={doc.id} className="flex items-start sm:items-center gap-3 px-4 py-3 hover:bg-secondary/20 transition-colors group">
              {/* Drag handle (visual only) */}
              <span className="text-muted-foreground/40 cursor-grab shrink-0 mt-1 sm:mt-0">
                <GripVertical className="h-4 w-4" />
              </span>

              {/* Main info */}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 mb-1">
                  <p className="text-sm font-medium text-foreground truncate max-w-[260px]">{doc.title}</p>
                  {doc.is_pinned && <Pin className="h-3 w-3 text-gold fill-gold" />}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge className={`text-xs border ${CATEGORY_COLORS[doc.category]}`}>{doc.category}</Badge>
                  {doc.is_required && (
                    <Badge className="text-xs border bg-destructive/10 text-destructive border-destructive/30 gap-1">
                      <AlertTriangle className="h-3 w-3" /> Required
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">v{doc.version}</span>
                </div>
                {/* Ack count */}
                {doc.is_required && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {ackCount} / {totalDrivers} acknowledged
                  </p>
                )}
              </div>

              {/* Toggles */}
              <div className="flex items-center gap-4 shrink-0">
                <div className="flex items-center gap-1.5" title="Visible to drivers">
                  {doc.is_visible ? <Eye className="h-3.5 w-3.5 text-status-complete" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
                  <Switch
                    checked={doc.is_visible}
                    disabled={toggling === `${doc.id}-is_visible`}
                    onCheckedChange={() => handleToggle(doc, 'is_visible')}
                    className="scale-90"
                  />
                </div>
                <div className="flex items-center gap-1.5 hidden sm:flex" title="Required">
                  <AlertTriangle className={`h-3.5 w-3.5 ${doc.is_required ? 'text-destructive' : 'text-muted-foreground'}`} />
                  <Switch
                    checked={doc.is_required}
                    disabled={toggling === `${doc.id}-is_required`}
                    onCheckedChange={() => handleToggle(doc, 'is_required')}
                    className="scale-90"
                  />
                </div>
                <div className="flex items-center gap-1.5 hidden sm:flex" title="Pinned">
                  <Pin className={`h-3.5 w-3.5 ${doc.is_pinned ? 'text-gold fill-gold' : 'text-muted-foreground'}`} />
                  <Switch
                    checked={doc.is_pinned}
                    disabled={toggling === `${doc.id}-is_pinned`}
                    onCheckedChange={() => handleToggle(doc, 'is_pinned')}
                    className="scale-90"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(doc)}>
                  <Edit2 className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(doc)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={o => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "<strong>{deleteTarget?.title}</strong>"? This cannot be undone and all acknowledgment records will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
