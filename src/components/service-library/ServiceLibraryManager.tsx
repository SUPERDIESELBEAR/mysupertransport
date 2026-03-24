import { useState, useEffect, useCallback } from 'react';
import { differenceInDays, parseISO } from 'date-fns';
import {
  Plus, Pencil, Trash2, GripVertical,
  CheckCircle, AlertTriangle, ChevronDown, ChevronUp,
  BookOpen, HelpCircle, BarChart3,
} from 'lucide-react';
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
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useDemoMode } from '@/hooks/useDemoMode';
import DemoLockIcon from '@/components/DemoLockIcon';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ServiceFormModal from './ServiceFormModal';
import ResourceFormModal from './ResourceFormModal';
import HelpRequestsPanel from './HelpRequestsPanel';
import LibraryAnalytics from './LibraryAnalytics';
import ResourceTypeBadge from './ResourceTypeBadge';
import type { Service, ServiceResource, ResourceType } from './ServiceLibraryTypes';

// ─── Sortable Service Row wrapper ────────────────────────────────────────────

interface SortableServiceRowProps extends ServiceRowProps {
  isDragOverlay?: boolean;
}

function SortableServiceRow(props: SortableServiceRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.service.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    position: 'relative' as const,
    zIndex: isDragging ? 0 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <ServiceRow {...props} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  );
}

// ─── Sortable Resource Row wrapper ────────────────────────────────────────────

interface SortableResourceRowProps {
  resource: ServiceResource;
  onEdit: () => void;
  onDelete: () => void;
  onToggleVisible: () => void;
  onToggleStartHere: () => void;
  onMarkVerified: () => void;
  isDragOverlay?: boolean;
}

function SortableResourceRow(props: SortableResourceRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.resource.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <ResourceAdminRow {...props} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ServiceLibraryManager() {
  const { toast } = useToast();
  const { guardDemo } = useDemoMode();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedService, setExpandedService] = useState<string | null>(null);
  const [serviceResources, setServiceResources] = useState<Record<string, ServiceResource[]>>({});
  const [loadingResources, setLoadingResources] = useState<Set<string>>(new Set());

  // DnD active items
  const [activeDragServiceId, setActiveDragServiceId] = useState<string | null>(null);
  const [activeDragResourceId, setActiveDragResourceId] = useState<string | null>(null);
  const [draggingInServiceId, setDraggingInServiceId] = useState<string | null>(null);

  // Modals
  const [serviceFormOpen, setServiceFormOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [resourceFormOpen, setResourceFormOpen] = useState(false);
  const [editingResource, setEditingResource] = useState<ServiceResource | null>(null);
  const [resourceServiceId, setResourceServiceId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'service' | 'resource'; id: string; name: string } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const fetchServices = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('services').select('*').order('sort_order');
    setServices((data as Service[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchServices(); }, [fetchServices]);

  const fetchResources = async (serviceId: string) => {
    setLoadingResources(prev => new Set(prev).add(serviceId));
    const { data } = await supabase
      .from('service_resources')
      .select('*')
      .eq('service_id', serviceId)
      .order('sort_order');
    setServiceResources(prev => ({ ...prev, [serviceId]: (data as ServiceResource[]) ?? [] }));
    setLoadingResources(prev => { const next = new Set(prev); next.delete(serviceId); return next; });
  };

  const handleToggleExpand = (serviceId: string) => {
    if (expandedService === serviceId) {
      setExpandedService(null);
    } else {
      setExpandedService(serviceId);
      if (!serviceResources[serviceId]) fetchResources(serviceId);
    }
  };

  const handleToggleVisible = async (service: Service) => {
    if (guardDemo()) return;
    const { error } = await supabase
      .from('services')
      .update({ is_visible: !service.is_visible })
      .eq('id', service.id);
    if (error) { toast({ title: 'Error', variant: 'destructive' }); return; }
    setServices(prev => prev.map(s => s.id === service.id ? { ...s, is_visible: !s.is_visible } : s));
    toast({ title: service.is_visible ? 'Hidden from drivers' : 'Visible to drivers ✓' });
  };

  const handleToggleEssential = async (service: Service) => {
    if (guardDemo()) return;
    const { error } = await supabase
      .from('services')
      .update({ is_new_driver_essential: !service.is_new_driver_essential })
      .eq('id', service.id);
    if (error) { toast({ title: 'Error', variant: 'destructive' }); return; }
    setServices(prev => prev.map(s => s.id === service.id ? { ...s, is_new_driver_essential: !s.is_new_driver_essential } : s));
    toast({ title: service.is_new_driver_essential ? 'Removed from essentials' : 'Marked as New Driver Essential ✓' });
  };

  const handleToggleResourceVisible = async (resource: ServiceResource) => {
    if (guardDemo()) return;
    const { error } = await supabase
      .from('service_resources')
      .update({ is_visible: !resource.is_visible })
      .eq('id', resource.id);
    if (error) { toast({ title: 'Error', variant: 'destructive' }); return; }
    setServiceResources(prev => ({
      ...prev,
      [resource.service_id]: (prev[resource.service_id] ?? []).map(r =>
        r.id === resource.id ? { ...r, is_visible: !r.is_visible } : r
      ),
    }));
    toast({ title: resource.is_visible ? 'Hidden from drivers' : 'Visible to drivers ✓' });
  };

  const handleToggleStartHere = async (resource: ServiceResource) => {
    if (guardDemo()) return;
    const { error } = await supabase
      .from('service_resources')
      .update({ is_start_here: !resource.is_start_here })
      .eq('id', resource.id);
    if (error) { toast({ title: 'Error', variant: 'destructive' }); return; }
    setServiceResources(prev => ({
      ...prev,
      [resource.service_id]: (prev[resource.service_id] ?? []).map(r =>
        r.id === resource.id ? { ...r, is_start_here: !r.is_start_here } : r
      ),
    }));
    toast({ title: resource.is_start_here ? 'Removed from Getting Started' : 'Added to Getting Started ✓' });
  };

  const handleMarkVerified = async (resource: ServiceResource) => {
    if (guardDemo()) return;
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('service_resources')
      .update({ last_verified_at: now })
      .eq('id', resource.id);
    if (error) { toast({ title: 'Error', variant: 'destructive' }); return; }
    setServiceResources(prev => ({
      ...prev,
      [resource.service_id]: (prev[resource.service_id] ?? []).map(r =>
        r.id === resource.id ? { ...r, last_verified_at: now } : r
      ),
    }));
    toast({ title: 'Marked as verified ✓' });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    if (guardDemo()) return;
    if (deleteTarget.type === 'service') {
      const { error } = await supabase.from('services').delete().eq('id', deleteTarget.id);
      if (error) { toast({ title: 'Error', variant: 'destructive' }); return; }
      setServices(prev => prev.filter(s => s.id !== deleteTarget.id));
      if (expandedService === deleteTarget.id) setExpandedService(null);
      toast({ title: 'Service deleted' });
    } else {
      const resource = Object.values(serviceResources).flat().find(r => r.id === deleteTarget.id);
      const { error } = await supabase.from('service_resources').delete().eq('id', deleteTarget.id);
      if (error) { toast({ title: 'Error', variant: 'destructive' }); return; }
      if (resource) {
        setServiceResources(prev => ({
          ...prev,
          [resource.service_id]: (prev[resource.service_id] ?? []).filter(r => r.id !== deleteTarget.id),
        }));
      }
      toast({ title: 'Resource deleted' });
    }
    setDeleteTarget(null);
  };

  const handleServiceSaved = (saved: Service) => {
    if (editingService) {
      setServices(prev => prev.map(s => s.id === saved.id ? saved : s));
    } else {
      setServices(prev => [...prev, saved].sort((a, b) => a.sort_order - b.sort_order));
    }
    setServiceFormOpen(false);
    setEditingService(null);
  };

  const handleResourceSaved = (saved: ServiceResource) => {
    setServiceResources(prev => {
      const existing = prev[saved.service_id] ?? [];
      if (editingResource) {
        return { ...prev, [saved.service_id]: existing.map(r => r.id === saved.id ? saved : r) };
      }
      return { ...prev, [saved.service_id]: [...existing, saved].sort((a, b) => a.sort_order - b.sort_order) };
    });
    setResourceFormOpen(false);
    setEditingResource(null);
  };

  // ── DnD: Services ──────────────────────────────────────────────────────────

  const handleServiceDragStart = (event: DragStartEvent) => {
    setActiveDragServiceId(event.active.id as string);
  };

  const handleServiceDragEnd = async (event: DragEndEvent) => {
    setActiveDragServiceId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    if (guardDemo()) return;

    const oldIndex = services.findIndex(s => s.id === active.id);
    const newIndex = services.findIndex(s => s.id === over.id);
    const reordered = arrayMove(services, oldIndex, newIndex).map((s, i) => ({ ...s, sort_order: i }));
    setServices(reordered);

    // Persist to DB
    await Promise.all(
      reordered.map(s =>
        supabase.from('services').update({ sort_order: s.sort_order }).eq('id', s.id)
      )
    );
    toast({ title: 'Order saved ✓' });
  };

  // ── DnD: Resources ─────────────────────────────────────────────────────────

  const handleResourceDragStart = (serviceId: string) => (event: DragStartEvent) => {
    setActiveDragResourceId(event.active.id as string);
    setDraggingInServiceId(serviceId);
  };

  const handleResourceDragEnd = (serviceId: string) => async (event: DragEndEvent) => {
    setActiveDragResourceId(null);
    setDraggingInServiceId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    if (guardDemo()) return;

    const resources = serviceResources[serviceId] ?? [];
    const oldIndex = resources.findIndex(r => r.id === active.id);
    const newIndex = resources.findIndex(r => r.id === over.id);
    const reordered = arrayMove(resources, oldIndex, newIndex).map((r, i) => ({ ...r, sort_order: i }));
    setServiceResources(prev => ({ ...prev, [serviceId]: reordered }));

    await Promise.all(
      reordered.map(r =>
        supabase.from('service_resources').update({ sort_order: r.sort_order }).eq('id', r.id)
      )
    );
    toast({ title: 'Resource order saved ✓' });
  };

  const activeDragService = activeDragServiceId ? services.find(s => s.id === activeDragServiceId) : null;
  const activeDragResource = activeDragResourceId && draggingInServiceId
    ? (serviceResources[draggingInServiceId] ?? []).find(r => r.id === activeDragResourceId)
    : null;

  return (
    <>
      <AlertDialog open={!!deleteTarget} onOpenChange={v => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.type === 'service' ? 'Service' : 'Resource'}?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.name}" will be permanently deleted. This cannot be undone.
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

      {serviceFormOpen && (
        <ServiceFormModal
          service={editingService}
          onClose={() => { setServiceFormOpen(false); setEditingService(null); }}
          onSaved={handleServiceSaved}
        />
      )}

      {resourceFormOpen && resourceServiceId && (
        <ResourceFormModal
          resource={editingResource}
          serviceId={resourceServiceId}
          onClose={() => { setResourceFormOpen(false); setEditingResource(null); }}
          onSaved={handleResourceSaved}
        />
      )}

      <Tabs defaultValue="services">
        <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Service Library Manager</h2>
            <p className="text-sm text-muted-foreground">Drag to reorder services and resources, or manage content below.</p>
          </div>
          <div className="flex items-center gap-2">
            <TabsList>
              <TabsTrigger value="services" className="gap-1.5"><BookOpen className="h-3.5 w-3.5" />Services</TabsTrigger>
              <TabsTrigger value="help-requests" className="gap-1.5"><HelpCircle className="h-3.5 w-3.5" />Help Requests</TabsTrigger>
              <TabsTrigger value="analytics" className="gap-1.5"><BarChart3 className="h-3.5 w-3.5" />Analytics</TabsTrigger>
            </TabsList>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => { setEditingService(null); setServiceFormOpen(true); }}
            >
              <Plus className="h-4 w-4" />
              Add Service
            </Button>
          </div>
        </div>

        <TabsContent value="services" className="space-y-3 mt-0">
          {loading ? (
            [...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)
          ) : services.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground border border-dashed border-border rounded-xl">
              <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No services yet</p>
              <p className="text-sm mt-1">Add your first service to get started.</p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleServiceDragStart}
              onDragEnd={handleServiceDragEnd}
            >
              <SortableContext items={services.map(s => s.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-3">
                  {services.map(service => (
                    <SortableServiceRow
                      key={service.id}
                      service={service}
                      expanded={expandedService === service.id}
                      resources={serviceResources[service.id] ?? []}
                      loadingResources={loadingResources.has(service.id)}
                      onToggleExpand={() => handleToggleExpand(service.id)}
                      onToggleVisible={() => handleToggleVisible(service)}
                      onToggleEssential={() => handleToggleEssential(service)}
                      onEdit={() => { setEditingService(service); setServiceFormOpen(true); }}
                      onDelete={() => setDeleteTarget({ type: 'service', id: service.id, name: service.name })}
                      onAddResource={() => { setResourceServiceId(service.id); setEditingResource(null); setResourceFormOpen(true); }}
                      onEditResource={r => { setEditingResource(r); setResourceServiceId(service.id); setResourceFormOpen(true); }}
                      onDeleteResource={r => setDeleteTarget({ type: 'resource', id: r.id, name: r.title })}
                      onToggleResourceVisible={handleToggleResourceVisible}
                      onToggleStartHere={handleToggleStartHere}
                      onMarkVerified={handleMarkVerified}
                      onResourceDragStart={handleResourceDragStart(service.id)}
                      onResourceDragEnd={handleResourceDragEnd(service.id)}
                      onResourcesReorder={(reordered) => setServiceResources(prev => ({ ...prev, [service.id]: reordered }))}
                    />
                  ))}
                </div>
              </SortableContext>
              <DragOverlay>
                {activeDragService && (
                  <ServiceRow
                    service={activeDragService}
                    expanded={false}
                    resources={[]}
                    loadingResources={false}
                    onToggleExpand={() => {}}
                    onToggleVisible={() => {}}
                    onToggleEssential={() => {}}
                    onEdit={() => {}}
                    onDelete={() => {}}
                    onAddResource={() => {}}
                    onEditResource={() => {}}
                    onDeleteResource={() => {}}
                    onToggleResourceVisible={() => {}}
                    onToggleStartHere={() => {}}
                    onMarkVerified={() => {}}
                    onResourceDragStart={() => {}}
                    onResourceDragEnd={() => {}}
                    onResourcesReorder={() => {}}
                    isDragOverlay
                  />
                )}
              </DragOverlay>
            </DndContext>
          )}
        </TabsContent>

        <TabsContent value="help-requests" className="mt-0">
          <HelpRequestsPanel />
        </TabsContent>

        <TabsContent value="analytics" className="mt-0">
          <LibraryAnalytics services={services} />
        </TabsContent>
      </Tabs>
    </>
  );
}

// ─── ServiceRow ───────────────────────────────────────────────────────────────

interface ServiceRowProps {
  service: Service;
  expanded: boolean;
  resources: ServiceResource[];
  loadingResources: boolean;
  onToggleExpand: () => void;
  onToggleVisible: () => void;
  onToggleEssential: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddResource: () => void;
  onEditResource: (r: ServiceResource) => void;
  onDeleteResource: (r: ServiceResource) => void;
  onToggleResourceVisible: (r: ServiceResource) => void;
  onToggleStartHere: (r: ServiceResource) => void;
  onMarkVerified: (r: ServiceResource) => void;
  onResourceDragStart: (event: DragStartEvent) => void;
  onResourceDragEnd: (event: DragEndEvent) => void;
  onResourcesReorder: (reordered: ServiceResource[]) => void;
  dragHandleProps?: React.HTMLAttributes<HTMLElement>;
  isDragOverlay?: boolean;
}

function ServiceRow({
  service, expanded, resources, loadingResources,
  onToggleExpand, onToggleVisible, onToggleEssential,
  onEdit, onDelete, onAddResource, onEditResource, onDeleteResource,
  onToggleResourceVisible, onToggleStartHere, onMarkVerified,
  onResourceDragStart, onResourceDragEnd,
  dragHandleProps,
  isDragOverlay,
}: ServiceRowProps) {

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  return (
    <div className={`border border-border rounded-xl overflow-hidden bg-card ${isDragOverlay ? 'shadow-2xl ring-2 ring-primary/30 rotate-1' : ''}`}>
      {/* Service header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <span
          {...dragHandleProps}
          className="cursor-grab active:cursor-grabbing touch-none shrink-0 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
          title="Drag to reorder"
        >
          <GripVertical className="h-4 w-4" />
        </span>
        {service.logo_url ? (
          <img src={service.logo_url} alt="" className="h-8 w-8 rounded-lg object-contain bg-muted shrink-0" />
        ) : (
          <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-foreground text-sm truncate">{service.name}</p>
          {service.description && (
            <p className="text-xs text-muted-foreground truncate">{service.description}</p>
          )}
        </div>

        {/* Toggles */}
        <div className="flex items-center gap-4 shrink-0">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
            <div className="relative inline-flex">
              <Switch checked={service.is_visible} onCheckedChange={onToggleVisible} />
              <DemoLockIcon badge />
            </div>
            <span className="hidden sm:inline">Visible</span>
          </label>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
            <div className="relative inline-flex">
              <Switch checked={service.is_new_driver_essential} onCheckedChange={onToggleEssential} />
              <DemoLockIcon badge />
            </div>
            <span className="hidden sm:inline">Essential</span>
          </label>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <Button size="sm" variant="ghost" onClick={onEdit} className="h-8 w-8 p-0">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <div className="relative inline-flex">
            <Button size="sm" variant="ghost" onClick={onDelete} className="h-8 w-8 p-0 text-destructive hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
            <DemoLockIcon badge />
          </div>
          <Button size="sm" variant="ghost" onClick={onToggleExpand} className="h-8 w-8 p-0">
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {/* Resources */}
      {expanded && !isDragOverlay && (
        <div className="border-t border-border bg-muted/20">
          <div className="flex items-center justify-between px-4 py-2.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Resources ({resources.length})</p>
            <Button size="sm" variant="outline" onClick={onAddResource} className="h-7 text-xs gap-1.5">
              <Plus className="h-3 w-3" /> Add Resource
            </Button>
          </div>
          {loadingResources ? (
            <div className="px-4 pb-3 space-y-2">
              {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
            </div>
          ) : resources.length === 0 ? (
            <div className="px-4 pb-4 text-center text-muted-foreground text-sm">No resources yet.</div>
          ) : (
            <div className="px-4 pb-3">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={onResourceDragStart}
                onDragEnd={onResourceDragEnd}
              >
                <SortableContext items={resources.map(r => r.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {resources.map(r => (
                      <SortableResourceRow
                        key={r.id}
                        resource={r}
                        onEdit={() => onEditResource(r)}
                        onDelete={() => onDeleteResource(r)}
                        onToggleVisible={() => onToggleResourceVisible(r)}
                        onToggleStartHere={() => onToggleStartHere(r)}
                        onMarkVerified={() => onMarkVerified(r)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── ResourceAdminRow ─────────────────────────────────────────────────────────

function ResourceAdminRow({ resource, onEdit, onDelete, onToggleVisible, onToggleStartHere, onMarkVerified, dragHandleProps, isDragOverlay }: {
  resource: ServiceResource;
  onEdit: () => void;
  onDelete: () => void;
  onToggleVisible: () => void;
  onToggleStartHere: () => void;
  onMarkVerified: () => void;
  dragHandleProps?: React.HTMLAttributes<HTMLElement>;
  isDragOverlay?: boolean;
}) {
  const isOutdated = resource.last_verified_at
    ? differenceInDays(new Date(), parseISO(resource.last_verified_at)) > 90
    : true;

  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg border border-border bg-card ${isDragOverlay ? 'shadow-2xl ring-2 ring-primary/30 rotate-1' : ''}`}>
      <span
        {...dragHandleProps}
        className="cursor-grab active:cursor-grabbing touch-none shrink-0 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
        title="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <ResourceTypeBadge type={resource.resource_type} />
          {resource.is_start_here && <Badge className="text-xs bg-primary/10 text-primary border-primary/30 border">⭐ Start Here</Badge>}
          {isOutdated && <Badge className="text-xs bg-warning/10 text-warning border-warning/30 border gap-1"><AlertTriangle className="h-2.5 w-2.5" />Outdated</Badge>}
        </div>
        <p className="text-sm font-medium text-foreground mt-0.5 truncate">{resource.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {resource.last_verified_at
            ? `Verified ${new Date(resource.last_verified_at).toLocaleDateString()}`
            : 'Not yet verified'}
        </p>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <div className="relative inline-flex">
          <Switch checked={resource.is_visible} onCheckedChange={onToggleVisible} />
          <DemoLockIcon badge />
        </div>
        <div className="relative inline-flex">
          <Switch checked={resource.is_start_here} onCheckedChange={onToggleStartHere} />
          <DemoLockIcon badge />
        </div>
        <Button size="sm" variant="outline" onClick={onMarkVerified} className="h-7 text-xs gap-1 hidden sm:flex">
          <CheckCircle className="h-3 w-3" />Verified
        </Button>
        <Button size="sm" variant="ghost" onClick={onEdit} className="h-7 w-7 p-0">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <div className="relative inline-flex">
          <Button size="sm" variant="ghost" onClick={onDelete} className="h-7 w-7 p-0 text-destructive hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <DemoLockIcon badge />
        </div>
      </div>
    </div>
  );
}
