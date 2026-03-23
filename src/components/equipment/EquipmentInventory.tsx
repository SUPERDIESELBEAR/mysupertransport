import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import {
  Cpu, Camera, CreditCard, Tag, Plus, Search,
  Package, CheckCircle2, AlertTriangle, XCircle,
  ChevronDown, ChevronUp, History, UserCheck, RotateCcw,
  Pencil, Loader2
} from 'lucide-react';
import EquipmentItemModal from './EquipmentItemModal';
import EquipmentAssignModal from './EquipmentAssignModal';
import EquipmentReturnModal from './EquipmentReturnModal';
import EquipmentHistoryModal from './EquipmentHistoryModal';

export type DeviceType = 'eld' | 'dash_cam' | 'bestpass' | 'fuel_card';
export type EquipmentStatus = 'available' | 'assigned' | 'damaged' | 'lost';

export interface EquipmentItem {
  id: string;
  device_type: DeviceType;
  serial_number: string;
  status: EquipmentStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // joined
  current_operator_name?: string | null;
  current_assignment_id?: string | null;
}

const DEVICE_CONFIG: Record<DeviceType, { label: string; icon: React.ReactNode; color: string }> = {
  eld:       { label: 'ELD',        icon: <Cpu className="h-4 w-4" />,        color: 'text-primary' },
  dash_cam:  { label: 'Dash Cam',   icon: <Camera className="h-4 w-4" />,     color: 'text-status-progress' },
  bestpass:  { label: 'BestPass',   icon: <Tag className="h-4 w-4" />,        color: 'text-status-complete' },
  fuel_card: { label: 'Fuel Card',  icon: <CreditCard className="h-4 w-4" />, color: 'text-warning' },
};

const STATUS_CONFIG: Record<EquipmentStatus, { label: string; color: string; icon: React.ReactNode }> = {
  available: { label: 'Available',      color: 'bg-status-complete/15 text-status-complete border-status-complete/30', icon: <CheckCircle2 className="h-3 w-3" /> },
  assigned:  { label: 'Assigned',       color: 'bg-primary/15 text-primary border-primary/30',                        icon: <UserCheck className="h-3 w-3" /> },
  damaged:   { label: 'Damaged',        color: 'bg-amber-500/15 text-amber-700 border-amber-400/30',                  icon: <AlertTriangle className="h-3 w-3" /> },
  lost:      { label: 'Lost/Missing',   color: 'bg-destructive/15 text-destructive border-destructive/30',            icon: <XCircle className="h-3 w-3" /> },
};

export default function EquipmentInventory({ isManagement = false }: { isManagement?: boolean }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<EquipmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<DeviceType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<EquipmentStatus | 'all'>('all');
  const [expandedType, setExpandedType] = useState<DeviceType | null>(null);

  // Modals
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<EquipmentItem | null>(null);
  const [assignItem, setAssignItem] = useState<EquipmentItem | null>(null);
  const [returnItem, setReturnItem] = useState<EquipmentItem | null>(null);
  const [historyItem, setHistoryItem] = useState<EquipmentItem | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const { data: itemsData, error } = await supabase
      .from('equipment_items')
      .select('*')
      .order('device_type')
      .order('serial_number');

    if (error) { toast({ title: 'Error loading inventory', variant: 'destructive' }); setLoading(false); return; }

    // Fetch open assignments to know which operator has each device
    const { data: assignments } = await supabase
      .from('equipment_assignments')
      .select(`
        id,
        equipment_id,
        operator_id,
        operators!inner(
          application_id,
          applications(first_name, last_name)
        )
      `)
      .is('returned_at', null);

    const assignmentMap: Record<string, { name: string; assignmentId: string }> = {};
    for (const a of (assignments ?? []) as any[]) {
      const app = a.operators?.applications;
      const name = [app?.first_name, app?.last_name].filter(Boolean).join(' ') || 'Unknown Operator';
      assignmentMap[a.equipment_id] = { name, assignmentId: a.id };
    }

    const enriched: EquipmentItem[] = (itemsData ?? []).map((item: any) => ({
      ...item,
      current_operator_name: assignmentMap[item.id]?.name ?? null,
      current_assignment_id: assignmentMap[item.id]?.assignmentId ?? null,
    }));

    setItems(enriched);
    setLoading(false);
  }, [toast]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const filtered = items.filter(item => {
    const matchType = typeFilter === 'all' || item.device_type === typeFilter;
    const matchStatus = statusFilter === 'all' || item.status === statusFilter;
    const q = search.toLowerCase();
    const matchSearch = !q || item.serial_number.toLowerCase().includes(q)
      || (item.current_operator_name ?? '').toLowerCase().includes(q)
      || (item.notes ?? '').toLowerCase().includes(q);
    return matchType && matchStatus && matchSearch;
  });

  // Group by device_type for the card view
  const grouped: Record<DeviceType, EquipmentItem[]> = {
    eld: [], dash_cam: [], bestpass: [], fuel_card: [],
  };
  for (const item of filtered) grouped[item.device_type].push(item);

  // Summary counts
  const counts = {
    total: items.length,
    available: items.filter(i => i.status === 'available').length,
    assigned: items.filter(i => i.status === 'assigned').length,
    damaged: items.filter(i => i.status === 'damaged').length,
    lost: items.filter(i => i.status === 'lost').length,
  };

  const perType: Record<DeviceType, { total: number; available: number; assigned: number }> = {
    eld:       { total: 0, available: 0, assigned: 0 },
    dash_cam:  { total: 0, available: 0, assigned: 0 },
    bestpass:  { total: 0, available: 0, assigned: 0 },
    fuel_card: { total: 0, available: 0, assigned: 0 },
  };
  for (const item of items) {
    perType[item.device_type].total++;
    if (item.status === 'available') perType[item.device_type].available++;
    if (item.status === 'assigned') perType[item.device_type].assigned++;
  }

  const activeTypes = (Object.keys(grouped) as DeviceType[]).filter(t =>
    typeFilter === 'all' ? true : typeFilter === t
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Equipment Inventory</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Track ELDs, Dash Cams, BestPass tags, and Fuel Cards
          </p>
        </div>
        <Button onClick={() => setAddModalOpen(true)} className="gap-2 shrink-0">
          <Plus className="h-4 w-4" />
          Add Device
        </Button>
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {(Object.entries(STATUS_CONFIG) as [EquipmentStatus, typeof STATUS_CONFIG[EquipmentStatus]][]).map(([status, cfg]) => (
          <button
            key={status}
            onClick={() => setStatusFilter(prev => prev === status ? 'all' : status)}
            className={`rounded-xl border p-3 text-left transition-all hover:shadow-sm ${
              statusFilter === status ? cfg.color + ' border-current/50 shadow-sm' : 'bg-card border-border hover:border-primary/30'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className={statusFilter === status ? '' : 'text-muted-foreground'}>
                {cfg.icon}
              </span>
              <span className="text-xs text-muted-foreground">{cfg.label}</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{counts[status]}</p>
          </button>
        ))}
      </div>

      {/* Per-type quick summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {(Object.keys(perType) as DeviceType[]).map(type => {
          const cfg = DEVICE_CONFIG[type];
          const t = perType[type];
          const isActive = typeFilter === type;
          return (
            <button
              key={type}
              onClick={() => setTypeFilter(prev => prev === type ? 'all' : type)}
              className={`rounded-xl border p-3 text-left transition-all hover:shadow-sm ${
                isActive ? 'bg-primary/5 border-primary/40 shadow-sm' : 'bg-card border-border hover:border-primary/20'
              }`}
            >
              <div className={`flex items-center gap-1.5 mb-1 ${cfg.color}`}>
                {cfg.icon}
                <span className="text-xs font-medium">{cfg.label}</span>
              </div>
              <p className="text-lg font-bold text-foreground">{t.total}</p>
              <p className="text-xs text-muted-foreground">
                {t.available} avail · {t.assigned} assigned
              </p>
            </button>
          );
        })}
      </div>

      {/* Search + status filter bar */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search serial number, operator..."
            className="pl-8 h-9 text-sm"
          />
        </div>
        <div className="flex gap-1">
          {(['all', 'available', 'assigned', 'damaged', 'lost'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border ${
                statusFilter === s
                  ? s === 'all' ? 'bg-primary text-primary-foreground border-primary' : STATUS_CONFIG[s as EquipmentStatus].color
                  : 'bg-background text-muted-foreground border-border hover:border-primary/30'
              }`}
            >
              {s === 'all' ? 'All' : STATUS_CONFIG[s as EquipmentStatus].label}
            </button>
          ))}
        </div>
      </div>

      {/* Device groups */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-3">
          {activeTypes.map(type => {
            const cfg = DEVICE_CONFIG[type];
            const typeItems = grouped[type];
            const isExpanded = expandedType === type || typeItems.length <= 8;
            const showToggle = typeItems.length > 8;
            const displayItems = isExpanded ? typeItems : typeItems.slice(0, 8);

            return (
              <div key={type} className="border border-border rounded-xl bg-card overflow-hidden">
                {/* Group header */}
                <div className={`px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-2`}>
                  <span className={cfg.color}>{cfg.icon}</span>
                  <span className="font-semibold text-foreground text-sm">{cfg.label}</span>
                  <span className="text-xs text-muted-foreground ml-1">
                    {typeItems.length} device{typeItems.length !== 1 ? 's' : ''}
                  </span>
                  <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="text-status-complete font-medium">{typeItems.filter(i => i.status === 'available').length} avail</span>
                    <span>·</span>
                    <span className="text-primary font-medium">{typeItems.filter(i => i.status === 'assigned').length} assigned</span>
                    {typeItems.filter(i => i.status === 'damaged').length > 0 && (
                      <><span>·</span><span className="text-warning font-medium">{typeItems.filter(i => i.status === 'damaged').length} damaged</span></>
                    )}
                    {typeItems.filter(i => i.status === 'lost').length > 0 && (
                      <><span>·</span><span className="text-destructive font-medium">{typeItems.filter(i => i.status === 'lost').length} lost</span></>
                    )}
                  </div>
                </div>

                {typeItems.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground text-sm">
                    <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    No {cfg.label} devices found
                  </div>
                ) : (
                  <>
                    <div className="divide-y divide-border">
                      {displayItems.map(item => (
                        <EquipmentRow
                          key={item.id}
                          item={item}
                          isManagement={isManagement}
                          onEdit={() => setEditItem(item)}
                          onAssign={() => setAssignItem(item)}
                          onReturn={() => setReturnItem(item)}
                          onHistory={() => setHistoryItem(item)}
                        />
                      ))}
                    </div>
                    {showToggle && (
                      <button
                        onClick={() => setExpandedType(isExpanded ? null : type)}
                        className="w-full py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors flex items-center justify-center gap-1 border-t border-border"
                      >
                        {isExpanded ? (
                          <><ChevronUp className="h-3.5 w-3.5" /> Show less</>
                        ) : (
                          <><ChevronDown className="h-3.5 w-3.5" /> Show all {typeItems.length} {cfg.label} devices</>
                        )}
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}

          {activeTypes.every(t => grouped[t].length === 0) && (
            <div className="text-center py-16 text-muted-foreground">
              <Package className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No devices found</p>
              <p className="text-sm mt-1">Try adjusting your filters or add a new device.</p>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      <EquipmentItemModal
        open={addModalOpen || !!editItem}
        item={editItem}
        isManagement={isManagement}
        onClose={() => { setAddModalOpen(false); setEditItem(null); }}
        onSaved={fetchItems}
      />
      <EquipmentAssignModal
        open={!!assignItem}
        item={assignItem}
        onClose={() => setAssignItem(null)}
        onSaved={fetchItems}
      />
      <EquipmentReturnModal
        open={!!returnItem}
        item={returnItem}
        isManagement={isManagement}
        onClose={() => setReturnItem(null)}
        onSaved={fetchItems}
      />
      <EquipmentHistoryModal
        open={!!historyItem}
        item={historyItem}
        onClose={() => setHistoryItem(null)}
      />
    </div>
  );
}

function EquipmentRow({
  item,
  isManagement,
  onEdit,
  onAssign,
  onReturn,
  onHistory,
}: {
  item: EquipmentItem;
  isManagement: boolean;
  onEdit: () => void;
  onAssign: () => void;
  onReturn: () => void;
  onHistory: () => void;
}) {
  const cfg = STATUS_CONFIG[item.status];
  const devCfg = DEVICE_CONFIG[item.device_type];

  return (
    <div className="px-4 py-3 flex items-center gap-3 hover:bg-muted/20 transition-colors group">
      {/* Serial + type */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`font-mono text-sm font-semibold text-foreground`}>
            {item.serial_number}
          </span>
          <Badge variant="outline" className={`text-xs gap-1 ${cfg.color}`}>
            {cfg.icon}{cfg.label}
          </Badge>
        </div>
        {item.status === 'assigned' && item.current_operator_name && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            <UserCheck className="h-3 w-3 inline mr-1 text-primary" />
            {item.current_operator_name}
          </p>
        )}
        {item.notes && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate italic">{item.notes}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onHistory}
          title="View history"
          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <History className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onEdit}
          title="Edit"
          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        {item.status === 'available' && (
          <button
            onClick={onAssign}
            title="Assign to operator"
            className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
          >
            <UserCheck className="h-3.5 w-3.5" />
          </button>
        )}
        {item.status === 'assigned' && (
          <button
            onClick={onReturn}
            title="Record return"
            className="p-1.5 rounded-lg hover:bg-status-complete/10 text-muted-foreground hover:text-status-complete transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
