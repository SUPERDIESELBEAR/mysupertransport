import { useState, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Edit2, Trash2, GripVertical, Eye, EyeOff, AlertTriangle, CheckCircle2, Pin, FileText, Video } from 'lucide-react';
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
import { useDemoMode } from '@/hooks/useDemoMode';
import DemoLockIcon from '@/components/DemoLockIcon';

interface AdminDocumentListProps {
  documents: DriverDocument[];
  ackCounts: Record<string, number>;
  totalDrivers: number;
  onEdit: (doc: DriverDocument) => void;
  onRefresh: () => void;
}

// ── Single sortable row ───────────────────────────────────────────────────────

interface SortableRowProps {
  doc: DriverDocument;
  ackCount: number;
  totalDrivers: number;
  toggling: string | null;
  onToggle: (doc: DriverDocument, field: 'is_visible' | 'is_required' | 'is_pinned') => void;
  onEdit: (doc: DriverDocument) => void;
  onDelete: (doc: DriverDocument) => void;
  isDragging?: boolean;
}

function SortableRow({
  doc, ackCount, totalDrivers, toggling,
  onToggle, onEdit, onDelete, isDragging = false,
}: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: doc.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isSortableDragging ? 0.35 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-start sm:items-center gap-3 px-4 py-3 transition-colors group ${
        isDragging
          ? 'bg-secondary/40 shadow-lg rounded-xl border border-border'
          : 'hover:bg-secondary/20 border-b border-border last:border-b-0'
      }`}
    >
      {/* Drag handle */}
      <span
        {...attributes}
        {...listeners}
        className="text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing shrink-0 mt-1 sm:mt-0 touch-none select-none"
        title="Drag to reorder"
      >
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
          {doc.content_type === 'pdf' && (
            <Badge className="text-xs border bg-secondary text-secondary-foreground border-border gap-1">
              <FileText className="h-3 w-3" /> PDF
            </Badge>
          )}
          {doc.content_type === 'video' && (
            <Badge className="text-xs border bg-info/10 text-info border-info/30 gap-1">
              <Video className="h-3 w-3" /> Video
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">v{doc.version}</span>
        </div>
        {doc.is_required && (
          <p className="text-xs text-muted-foreground mt-1">
            {ackCount} / {totalDrivers} acknowledged
          </p>
        )}
      </div>

      {/* Toggles */}
      <div className="flex items-center gap-4 shrink-0">
        <div className="relative inline-flex items-center gap-1.5" title="Visible to drivers">
          {doc.is_visible
            ? <Eye className="h-3.5 w-3.5 text-status-complete" />
            : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
          <div className="relative inline-flex">
            <Switch
              checked={doc.is_visible}
              disabled={toggling === `${doc.id}-is_visible`}
              onCheckedChange={() => onToggle(doc, 'is_visible')}
              className="scale-90"
            />
            <DemoLockIcon badge />
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-1.5" title="Required">
          <AlertTriangle className={`h-3.5 w-3.5 ${doc.is_required ? 'text-destructive' : 'text-muted-foreground'}`} />
          <div className="relative inline-flex">
            <Switch
              checked={doc.is_required}
              disabled={toggling === `${doc.id}-is_required`}
              onCheckedChange={() => onToggle(doc, 'is_required')}
              className="scale-90"
            />
            <DemoLockIcon badge />
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-1.5" title="Pinned">
          <Pin className={`h-3.5 w-3.5 ${doc.is_pinned ? 'text-gold fill-gold' : 'text-muted-foreground'}`} />
          <div className="relative inline-flex">
            <Switch
              checked={doc.is_pinned}
              disabled={toggling === `${doc.id}-is_pinned`}
              onCheckedChange={() => onToggle(doc, 'is_pinned')}
              className="scale-90"
            />
            <DemoLockIcon badge />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(doc)}>
          <Edit2 className="h-3.5 w-3.5" />
        </Button>
        <div className="relative inline-flex">
          <Button
            variant="ghost" size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={() => onDelete(doc)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <DemoLockIcon badge />
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AdminDocumentList({
  documents, ackCounts, totalDrivers, onEdit, onRefresh,
}: AdminDocumentListProps) {
  const { toast } = useToast();
  const { guardDemo } = useDemoMode();
  const [items, setItems] = useState<DriverDocument[]>(documents);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DriverDocument | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Keep local items in sync when parent refreshes
  useEffect(() => {
    setItems(documents);
  }, [documents]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const activeDoc = activeId ? items.find(d => d.id === activeId) ?? null : null;

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    if (guardDemo()) return;

    const oldIndex = items.findIndex(d => d.id === active.id);
    const newIndex = items.findIndex(d => d.id === over.id);
    const reordered = arrayMove(items, oldIndex, newIndex);

    // Optimistic update
    setItems(reordered);

    // Persist new sort_order values to Supabase
    setSaving(true);
    const results = await Promise.all(
      reordered.map((doc, idx) =>
        supabase
          .from('driver_documents')
          .update({ sort_order: idx })
          .eq('id', doc.id),
      ),
    );
    setSaving(false);

    const failed = results.find(r => r.error);
    if (failed) {
      toast({ title: 'Failed to save order', description: failed.error?.message, variant: 'destructive' });
      setItems(documents); // revert on failure
    } else {
      toast({ title: 'Order saved ✓' });
      onRefresh();
    }
  };

  const handleToggle = async (doc: DriverDocument, field: 'is_visible' | 'is_required' | 'is_pinned') => {
    if (guardDemo()) return;
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

    // Notify operators when made visible for the first time
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
            }),
          ),
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
    if (guardDemo()) return;
    const { error } = await supabase.from('driver_documents').delete().eq('id', deleteTarget.id);
    setDeleteTarget(null);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Document deleted' });
    onRefresh();
  };

  if (items.length === 0) {
    return (
      <div className="py-16 text-center text-muted-foreground">
        <CheckCircle2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p>No documents yet. Click "New Document" to create one.</p>
      </div>
    );
  }

  return (
    <>
      {saving && (
        <div className="px-4 py-1.5 text-xs text-muted-foreground bg-secondary/30 border-b border-border flex items-center gap-1.5 animate-pulse">
          Saving order…
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={items.map(d => d.id)} strategy={verticalListSortingStrategy}>
          <div className="divide-y divide-border">
            {items.map(doc => (
              <SortableRow
                key={doc.id}
                doc={doc}
                ackCount={ackCounts[doc.id] ?? 0}
                totalDrivers={totalDrivers}
                toggling={toggling}
                onToggle={handleToggle}
                onEdit={onEdit}
                onDelete={setDeleteTarget}
              />
            ))}
          </div>
        </SortableContext>

        {/* Ghost card that follows the cursor while dragging */}
        <DragOverlay dropAnimation={{ duration: 180, easing: 'ease' }}>
          {activeDoc && (
            <SortableRow
              doc={activeDoc}
              ackCount={ackCounts[activeDoc.id] ?? 0}
              totalDrivers={totalDrivers}
              toggling={null}
              onToggle={() => {}}
              onEdit={() => {}}
              onDelete={() => {}}
              isDragging
            />
          )}
        </DragOverlay>
      </DndContext>

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
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
