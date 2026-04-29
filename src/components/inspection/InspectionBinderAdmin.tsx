import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useBinderOrder } from '@/hooks/useBinderOrder';
import {
  Upload, Trash2, Calendar, Loader2, FileText, Globe, User,
  CheckCircle2, AlertTriangle, Clock, Eye, RotateCcw, Users, Share2, Bell,
  Inbox, UserCheck, X, Pencil, ArrowRight, CheckSquare, Copy, Check, GripVertical,
  BookOpen, UserCircle2,
} from 'lucide-react';
import BinderFlipbook, { type FlipbookPage } from './BinderFlipbook';
import { DateInput } from '@/components/ui/date-input';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  InspectionDocument, DriverUpload,
  COMPANY_WIDE_DOCS, PER_DRIVER_DOCS, parseLocalDate, formatDaysHuman,
  OPTIONAL_COMPANY_DOCS, isOptionalCompanyDoc, filterOptionalDocs,
} from './InspectionBinderTypes';
import { useDriverOptionalDocs } from '@/hooks/useDriverOptionalDocs';
import { ExpiryBadge, OnFileBadge, FilePreviewModal, bucketForBinderDoc, InspectedBadge, isInspectionDateDoc } from './DocRow';
import { syncInspectionBinderDateFromVehicleHub } from '@/lib/syncInspectionBinderDate';

/** Returns true if a reminder was sent within the last 24 hours */
function isOnCooldown(sentAt: string | undefined): boolean {
  if (!sentAt) return false;
  return Date.now() - new Date(sentAt).getTime() < 24 * 60 * 60 * 1000;
}

interface ReminderRecord {
  doc_type: string;
  sent_at: string;
  sent_by_name: string | null;
}

interface OperatorOption {
  userId: string;
  operatorId: string;
  name: string;
}

interface StagedDoc extends InspectionDocument {
  // driver_id is null for staged docs
}

interface Props {
  operatorUserId?: string;
  operatorName?: string;
}

const UPLOAD_STATUS_LABELS: Record<string, string> = {
  pending_review: 'Pending Review',
  reviewed: 'Reviewed',
  needs_attention: 'Needs Attention',
};

const UPLOAD_CATEGORY_LABELS: Record<string, string> = {
  roadside_inspection_report: 'Roadside Inspection Report',
  repairs_maintenance_receipt: 'Repairs & Maintenance Receipt',
  miscellaneous: 'Miscellaneous',
};

function UploadStatusBadge({ status }: { status: string }) {
  if (status === 'reviewed') return (
    <span className="inline-flex items-center gap-1 text-[10px] bg-status-complete/10 text-status-complete border border-status-complete/30 rounded-full px-2 py-0.5 font-semibold">
      <CheckCircle2 className="h-3 w-3" />Reviewed
    </span>
  );
  if (status === 'needs_attention') return (
    <span className="inline-flex items-center gap-1 text-[10px] bg-destructive/10 text-destructive border border-destructive/30 rounded-full px-2 py-0.5 font-semibold">
      <AlertTriangle className="h-3 w-3" />Needs Attention
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-[10px] bg-info/10 text-info border border-info/30 rounded-full px-2 py-0.5 font-semibold">
      <Clock className="h-3 w-3" />Pending Review
    </span>
  );
}

export default function InspectionBinderAdmin({ operatorUserId, operatorName }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { guardDemo } = useDemoMode();
  const { companyOrder, driverOrder, saveOrder } = useBinderOrder();
  const [searchParams] = useSearchParams();

  // Support deep-link: ?driver=<userId>&tab=driver|company|uploads
  const urlDriver = searchParams.get('driver') ?? '';
  const urlTab = searchParams.get('tab') as 'company' | 'driver' | 'uploads' | 'staging' | null;

  const [companyDocs, setCompanyDocs] = useState<InspectionDocument[]>([]);
  const [perDriverShareCounts, setPerDriverShareCounts] = useState<Record<string, number>>({});
  const [perDriverShareNames, setPerDriverShareNames] = useState<Record<string, string[]>>({});
  const [perDriverDocs, setPerDriverDocs] = useState<InspectionDocument[]>([]);
  const [driverUploads, setDriverUploads] = useState<DriverUpload[]>([]);
  const [stagedDocs, setStagedDocs] = useState<StagedDoc[]>([]);
  const [operators, setOperators] = useState<OperatorOption[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<string>(operatorUserId ?? urlDriver);
  const { enabled: enabledOptional, setOptional: setOptionalDoc } = useDriverOptionalDocs(selectedDriverId);
  const visibleCompanyOrder = filterOptionalDocs(companyOrder, enabledOptional);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InspectionDocument | null>(null);
  const [activeTab, setActiveTab] = useState<'company' | 'driver' | 'uploads' | 'staging'>(
    urlTab && ['company', 'driver', 'uploads', 'staging'].includes(urlTab) ? urlTab : 'company'
  );
  const [expiryEditing, setExpiryEditing] = useState<string | null>(null);
  const [expiryValue, setExpiryValue] = useState('');
  const [lastReminders, setLastReminders] = useState<Record<string, ReminderRecord>>({});
  const [sharingAll, setSharingAll] = useState(false);
  const [shareAllDialogOpen, setShareAllDialogOpen] = useState(false);
  const [unsharingAll, setUnsharingAll] = useState(false);
  const [unshareAllDialogOpen, setUnshareAllDialogOpen] = useState(false);
  const [sendingReminder, setSendingReminder] = useState<string | null>(null);
  const [reminderDialogDoc, setReminderDialogDoc] = useState<string | null>(null);

  // Flipbook overlay (per-driver only)
  const [flipbookOpen, setFlipbookOpen] = useState(false);
  const [unitNumber, setUnitNumber] = useState<string | null>(null);

  // In-app file preview
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState<string>('');
  const [previewFilePath, setPreviewFilePath] = useState<string | null>(null);

  // Share to specific driver state (per company doc)
  const [shareToDriverOpen, setShareToDriverOpen] = useState<string | null>(null); // doc id
  const [shareToDriverTarget, setShareToDriverTarget] = useState<string>('');
  const [sharingToDriver, setSharingToDriver] = useState(false);

  // Bulk-share to driver state
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set()); // doc ids
  const [bulkShareDialogOpen, setBulkShareDialogOpen] = useState(false);
  const [bulkShareStep, setBulkShareStep] = useState<'select' | 'preview'>('select');
  const [bulkShareTarget, setBulkShareTarget] = useState<string>('');
  const [bulkSharing, setBulkSharing] = useState(false);
  const [bulkPreviewLoading, setBulkPreviewLoading] = useState(false);
  // diff: docId → 'new' | 'skip'
  const [bulkDiff, setBulkDiff] = useState<Record<string, 'new' | 'skip'>>({});

  // Staging state
  const [stagingLabelMap, setStagingLabelMap] = useState<Record<string, string>>({});
  const [stagingAssignMap, setStagingAssignMap] = useState<Record<string, string>>({});
  const [assigningStaged, setAssigningStaged] = useState<string | null>(null);
  const [uploadingStaged, setUploadingStaged] = useState(false);
  const [newStagedLabel, setNewStagedLabel] = useState('');
  const stagingUploadRef = useRef<HTMLInputElement | null>(null);
  const [pendingStagedFile, setPendingStagedFile] = useState<File | null>(null);
  const [deleteStagedTarget, setDeleteStagedTarget] = useState<StagedDoc | null>(null);

  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const companyDocRowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Fetch operator list (for non-scoped admin)
  useEffect(() => {
    if (operatorUserId) return;
    (async () => {
      const { data } = await supabase
        .from('operators')
        .select('id, user_id, applications(first_name, last_name)')
        .order('created_at');
      if (!data) return;

      // Fetch profiles separately via user_id for operators with no application name
      const userIds = (data as any[])
        .filter(op => {
          const app = Array.isArray(op.applications) ? op.applications[0] : op.applications;
          return !app?.first_name && !app?.last_name;
        })
        .map(op => op.user_id);

      let profileMap: Record<string, { first_name: string | null; last_name: string | null }> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, first_name, last_name')
          .in('user_id', userIds);
        for (const p of profiles ?? []) {
          profileMap[p.user_id] = { first_name: p.first_name, last_name: p.last_name };
        }
      }

      const opts = (data as any[]).map(op => ({
        userId: op.user_id,
        operatorId: op.id,
        name: (() => {
          const app = Array.isArray(op.applications) ? op.applications[0] : op.applications;
          const prof = profileMap[op.user_id];
          const fn = app?.first_name ?? prof?.first_name ?? '';
          const ln = app?.last_name ?? prof?.last_name ?? '';
          return [fn, ln].filter(Boolean).join(' ') || op.user_id.slice(0, 8);
        })(),
      }));
      setOperators(opts);
    })();
  }, [operatorUserId]);

  const fetchDocs = useCallback(async () => {
    setLoading(true);

    // Resolve operator row id for cert_reminders lookup
    let resolvedOperatorId: string | null = null;
    if (selectedDriverId) {
      const { data: opRow } = await supabase
        .from('operators')
        .select('id')
        .eq('user_id', selectedDriverId)
        .maybeSingle();
      resolvedOperatorId = opRow?.id ?? null;
    }

    const [cRes, pdRes, duRes, remRes, stagRes, shareCountsRes] = await Promise.all([
      supabase.from('inspection_documents').select('*').eq('scope', 'company_wide').order('name'),
      selectedDriverId
        ? supabase.from('inspection_documents').select('*').eq('scope', 'per_driver').eq('driver_id', selectedDriverId).order('name')
        : Promise.resolve({ data: [] as InspectionDocument[] }),
      selectedDriverId
        ? supabase.from('driver_uploads').select('*').eq('driver_id', selectedDriverId).order('uploaded_at', { ascending: false })
        : Promise.resolve({ data: [] as DriverUpload[] }),
      resolvedOperatorId
        ? supabase
            .from('cert_reminders')
            .select('doc_type, sent_at, sent_by_name')
            .eq('operator_id', resolvedOperatorId)
            .order('sent_at', { ascending: false })
        : Promise.resolve({ data: [] as ReminderRecord[] }),
      // Staged: per_driver with null driver_id
      supabase
        .from('inspection_documents')
        .select('*')
        .eq('scope', 'per_driver')
        .is('driver_id', null)
        .order('uploaded_at', { ascending: false }),
      // Per-driver share counts: all per_driver docs with a non-null driver_id
      supabase
        .from('inspection_documents')
        .select('name, driver_id')
        .eq('scope', 'per_driver')
        .not('driver_id', 'is', null),
    ]);

    setCompanyDocs((cRes.data ?? []) as InspectionDocument[]);

    // Build docName → unique driver set map
    const shareRows = (shareCountsRes.data ?? []) as { name: string; driver_id: string }[];
    const driverIdMap: Record<string, Set<string>> = {};
    for (const row of shareRows) {
      if (!driverIdMap[row.name]) driverIdMap[row.name] = new Set();
      driverIdMap[row.name].add(row.driver_id);
    }
    setPerDriverShareCounts(Object.fromEntries(
      Object.entries(driverIdMap).map(([name, set]) => [name, set.size])
    ));

    // Resolve driver names for each unique driver_id
    const allDriverIds = [...new Set(shareRows.map(r => r.driver_id))];
    if (allDriverIds.length > 0) {
      const [appsRes, profilesRes] = await Promise.all([
        supabase
          .from('operators')
          .select('user_id, applications(first_name, last_name)')
          .in('user_id', allDriverIds),
        supabase
          .from('profiles')
          .select('user_id, first_name, last_name')
          .in('user_id', allDriverIds),
      ]);
      const driverNameMap: Record<string, string> = {};
      for (const p of (profilesRes.data ?? []) as any[]) {
        const fn = p.first_name ?? '';
        const ln = p.last_name ?? '';
        const name = [fn, ln].filter(Boolean).join(' ');
        if (name) driverNameMap[p.user_id] = name;
      }
      for (const op of (appsRes.data ?? []) as any[]) {
        const app = Array.isArray(op.applications) ? op.applications[0] : op.applications;
        if (app?.first_name || app?.last_name) {
          const name = [app.first_name, app.last_name].filter(Boolean).join(' ');
          if (name) driverNameMap[op.user_id] = name;
        }
      }
      const namesMap: Record<string, string[]> = {};
      for (const [docName, idSet] of Object.entries(driverIdMap)) {
        namesMap[docName] = [...idSet].map(id => driverNameMap[id] || id.slice(0, 8));
      }
      setPerDriverShareNames(namesMap);
    } else {
      setPerDriverShareNames({});
    }
    setPerDriverDocs((pdRes.data ?? []) as InspectionDocument[]);
    setDriverUploads((duRes.data ?? []) as DriverUpload[]);
    setStagedDocs((stagRes.data ?? []) as StagedDoc[]);

    // Build map: docName → most-recent reminder (results are DESC ordered so first wins)
    const recs = (remRes.data ?? []) as ReminderRecord[];
    const remMap: Record<string, ReminderRecord> = {};
    for (const r of recs) {
      if (!remMap[r.doc_type]) remMap[r.doc_type] = r;
    }
    setLastReminders(remMap);

    setLoading(false);
  }, [selectedDriverId]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  // Auto-populate "Periodic DOT Inspections" inspection date from latest
  // Vehicle Hub record when a driver is selected. Vehicle Hub wins.
  const inspectionSyncedRef = useRef<string | null>(null);
  useEffect(() => {
    if (loading) return;
    if (!selectedDriverId) return;
    if (inspectionSyncedRef.current === selectedDriverId) return;
    inspectionSyncedRef.current = selectedDriverId;
    (async () => {
      const changed = await syncInspectionBinderDateFromVehicleHub(selectedDriverId);
      if (changed) fetchDocs();
    })();
  }, [loading, selectedDriverId, fetchDocs]);

  // Fetch unit number for the Flipbook cover whenever the selected driver changes
  useEffect(() => {
    if (!selectedDriverId) { setUnitNumber(null); return; }
    (async () => {
      const { data: opRow } = await supabase
        .from('operators')
        .select('id')
        .eq('user_id', selectedDriverId)
        .maybeSingle();
      if (!opRow?.id) { setUnitNumber(null); return; }
      const { data: status } = await supabase
        .from('onboarding_status')
        .select('unit_number')
        .eq('operator_id', opRow.id)
        .maybeSingle();
      setUnitNumber((status as any)?.unit_number ?? null);
    })();
  }, [selectedDriverId]);

  const handleUpload = async (docName: string, scope: 'company_wide' | 'per_driver', file: File, existingId?: string) => {
    if (!user) return;
    if (guardDemo()) return;
    const driverId = scope === 'per_driver' ? selectedDriverId : null;
    if (scope === 'per_driver' && !driverId) {
      toast({ title: 'Select a driver first', variant: 'destructive' });
      return;
    }
    setUploading(docName);
    try {
      const ext = file.name.split('.').pop();
      const folder = scope === 'company_wide' ? 'company' : `driver/${driverId}`;
      const path = `${folder}/${docName.replace(/\s+/g, '-').toLowerCase()}/${Date.now()}.${ext}`;
      const { error: storageErr } = await supabase.storage.from('inspection-documents').upload(path, file, { upsert: false });
      if (storageErr) throw storageErr;

      const { data: urlData } = await supabase.storage.from('inspection-documents').createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      const fileUrl = urlData?.signedUrl ?? null;

      if (existingId) {
        await supabase.from('inspection_documents').update({ file_url: fileUrl, file_path: path, uploaded_at: new Date().toISOString(), uploaded_by: user.id }).eq('id', existingId);
      } else {
        await supabase.from('inspection_documents').insert({
          name: docName, scope, driver_id: driverId, file_url: fileUrl, file_path: path, uploaded_by: user.id,
        });
      }

      toast({ title: 'Uploaded!', description: `${docName} has been uploaded.` });
      fetchDocs();
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(null);
    }
  };

  const handleDelete = async (doc: InspectionDocument) => {
    if (guardDemo()) return;
    await supabase.from('inspection_documents').delete().eq('id', doc.id);
    if (doc.file_path) await supabase.storage.from('inspection-documents').remove([doc.file_path]);
    toast({ title: 'Deleted', description: `${doc.name} removed.` });
    fetchDocs();
    setDeleteTarget(null);
  };

  const handleDeleteStaged = async (doc: StagedDoc) => {
    if (guardDemo()) return;
    await supabase.from('inspection_documents').delete().eq('id', doc.id);
    if (doc.file_path) await supabase.storage.from('inspection-documents').remove([doc.file_path]);
    toast({ title: 'Deleted', description: `${doc.name} removed from staging.` });
    fetchDocs();
    setDeleteStagedTarget(null);
  };

  const saveExpiry = async (id: string) => {
    if (guardDemo()) return;
    await supabase.from('inspection_documents').update({ expires_at: expiryValue || null }).eq('id', id);
    toast({ title: 'Expiry updated' });
    setExpiryEditing(null);
    fetchDocs();
  };

  const updateUploadStatus = async (uploadId: string, status: 'pending_review' | 'reviewed' | 'needs_attention') => {
    if (guardDemo()) return;
    await supabase.from('driver_uploads').update({ status, reviewed_at: new Date().toISOString(), reviewed_by: user?.id }).eq('id', uploadId);
    toast({ title: 'Status updated', description: `Upload marked as ${UPLOAD_STATUS_LABELS[status]}.` });
    fetchDocs();
  };

  // ── Share company doc to a specific driver ──
  const handleShareToDriver = async (doc: InspectionDocument) => {
    if (!shareToDriverTarget || !user) return;
    setSharingToDriver(true);
    try {
      const driverName = operators.find(o => o.userId === shareToDriverTarget)?.name ?? 'Driver';
      // Check if already shared with this driver
      const { data: existing } = await supabase
        .from('inspection_documents')
        .select('id')
        .eq('scope', 'per_driver')
        .eq('driver_id', shareToDriverTarget)
        .eq('name', doc.name)
        .maybeSingle();

      if (existing) {
        toast({ title: 'Already shared', description: `${doc.name} is already in ${driverName}'s binder.` });
        setShareToDriverOpen(null);
        setShareToDriverTarget('');
        return;
      }

      await supabase.from('inspection_documents').insert({
        name: doc.name,
        scope: 'per_driver',
        driver_id: shareToDriverTarget,
        file_url: doc.file_url,
        file_path: doc.file_path,
        expires_at: doc.expires_at,
        uploaded_by: user.id,
        shared_with_fleet: false,
      });

      // Send in-app notification to the driver (respects their document_update preference)
      const { data: pref } = await supabase
        .from('notification_preferences')
        .select('in_app_enabled')
        .eq('user_id', shareToDriverTarget)
        .eq('event_type', 'document_update')
        .maybeSingle();

      const notifEnabled = pref ? pref.in_app_enabled : true;
      if (notifEnabled) {
        await supabase.from('notifications').insert({
          user_id: shareToDriverTarget,
          title: 'New document in your Inspection Binder',
          body: `"${doc.name}" has been added to your inspection binder.`,
          type: 'document_update',
          channel: 'in_app',
          link: '/operator?tab=inspection-binder',
        });
      }

      toast({
        title: `${doc.name} shared`,
        description: `Document added to ${driverName}'s binder.`,
      });
      setShareToDriverOpen(null);
      setShareToDriverTarget('');
      fetchDocs();
    } catch (err: any) {
      toast({ title: 'Share failed', description: err.message, variant: 'destructive' });
    } finally {
      setSharingToDriver(false);
    }
  };

  // ── Load diff: check which selected docs are already in driver's binder ──
  const loadBulkDiff = async (driverUserId: string) => {
    setBulkPreviewLoading(true);
    try {
      const docsToCheck = companyDocs.filter(d => bulkSelected.has(d.id) && d.file_url);
      const results = await Promise.all(
        docsToCheck.map(async doc => {
          const { data: existing } = await supabase
            .from('inspection_documents')
            .select('id')
            .eq('scope', 'per_driver')
            .eq('driver_id', driverUserId)
            .eq('name', doc.name)
            .maybeSingle();
          return { id: doc.id, status: existing ? 'skip' as const : 'new' as const };
        })
      );
      const diff: Record<string, 'new' | 'skip'> = {};
      for (const r of results) diff[r.id] = r.status;
      setBulkDiff(diff);
      setBulkShareStep('preview');
    } finally {
      setBulkPreviewLoading(false);
    }
  };

  // ── Bulk-share selected company docs to a specific driver ──
  const handleBulkShareToDriver = async () => {
    if (!bulkShareTarget || bulkSelected.size === 0 || !user) return;
    setBulkSharing(true);
    try {
      const driverName = operators.find(o => o.userId === bulkShareTarget)?.name ?? 'Driver';
      const docsToShare = companyDocs.filter(d => bulkSelected.has(d.id) && d.file_url);

      let skipped = 0;
      let shared = 0;

      // Check existing shares and insert new ones
      await Promise.all(docsToShare.map(async doc => {
        const { data: existing } = await supabase
          .from('inspection_documents')
          .select('id')
          .eq('scope', 'per_driver')
          .eq('driver_id', bulkShareTarget)
          .eq('name', doc.name)
          .maybeSingle();

        if (existing) { skipped++; return; }

        await supabase.from('inspection_documents').insert({
          name: doc.name,
          scope: 'per_driver',
          driver_id: bulkShareTarget,
          file_url: doc.file_url,
          file_path: doc.file_path,
          expires_at: doc.expires_at,
          uploaded_by: user.id,
          shared_with_fleet: false,
        });
        shared++;
      }));

      // Send one combined notification if any were newly shared
      if (shared > 0) {
        const { data: pref } = await supabase
          .from('notification_preferences')
          .select('in_app_enabled')
          .eq('user_id', bulkShareTarget)
          .eq('event_type', 'document_update')
          .maybeSingle();

        const notifEnabled = pref ? pref.in_app_enabled : true;
        if (notifEnabled) {
          await supabase.from('notifications').insert({
            user_id: bulkShareTarget,
            title: `${shared} new document${shared > 1 ? 's' : ''} in your Inspection Binder`,
            body: `Your coordinator shared ${shared} document${shared > 1 ? 's' : ''} to your binder.`,
            type: 'document_update',
            channel: 'in_app',
            link: '/operator?tab=inspection-binder',
          });
        }
      }

      if (shared > 0) {
        toast({
          title: `${shared} document${shared > 1 ? 's' : ''} shared to ${driverName}`,
          description: skipped > 0 ? `${skipped} already existed and were skipped.` : undefined,
        });
      } else {
        toast({ title: 'Nothing new to share', description: `All selected documents are already in ${driverName}'s binder.` });
      }

      setBulkSelected(new Set());
      setBulkShareDialogOpen(false);
      setBulkShareTarget('');
      fetchDocs();
    } catch (err: any) {
      toast({ title: 'Bulk share failed', description: err.message, variant: 'destructive' });
    } finally {
      setBulkSharing(false);
    }
  };

  // ── Staging: upload new unassigned doc ──
  const handleStagedUpload = async (file: File, label: string) => {
    if (!user) return;
    if (!label.trim()) {
      toast({ title: 'Label required', description: 'Enter a name for this document.', variant: 'destructive' });
      return;
    }
    setUploadingStaged(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `staging/${Date.now()}-${file.name.replace(/\s+/g, '-')}`;
      const { error: storageErr } = await supabase.storage.from('inspection-documents').upload(path, file, { upsert: false });
      if (storageErr) throw storageErr;

      const { data: urlData } = await supabase.storage.from('inspection-documents').createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      const fileUrl = urlData?.signedUrl ?? null;

      await supabase.from('inspection_documents').insert({
        name: label.trim(),
        scope: 'per_driver',
        driver_id: null,
        file_url: fileUrl,
        file_path: path,
        uploaded_by: user.id,
        shared_with_fleet: false,
      });

      toast({ title: 'Document staged', description: `${label} is ready to assign to a driver.` });
      setNewStagedLabel('');
      setPendingStagedFile(null);
      fetchDocs();
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
    } finally {
      setUploadingStaged(false);
    }
  };

  // ── Staging: assign staged doc to driver ──
  const handleAssignStaged = async (doc: StagedDoc) => {
    const driverUserId = stagingAssignMap[doc.id];
    if (!driverUserId) {
      toast({ title: 'Select a driver', description: 'Choose a driver to assign this document to.', variant: 'destructive' });
      return;
    }
    setAssigningStaged(doc.id);
    try {
      const driverName = operators.find(o => o.userId === driverUserId)?.name ?? 'Driver';

      // Assign the doc and check driver's notification preference in parallel
      const [, prefRes] = await Promise.all([
        supabase.from('inspection_documents').update({ driver_id: driverUserId }).eq('id', doc.id),
        supabase
          .from('notification_preferences')
          .select('in_app_enabled')
          .eq('user_id', driverUserId)
          .eq('event_type', 'document_update')
          .maybeSingle(),
      ]);

      // Default to enabled if no preference row exists
      const inAppEnabled = prefRes.data?.in_app_enabled ?? true;

      if (inAppEnabled) {
        await supabase.from('notifications').insert({
          user_id: driverUserId,
          title: 'New document in your Inspection Binder',
          body: `"${doc.name}" has been added to your Inspection Binder by your coordinator.`,
          type: 'document_update',
          channel: 'in_app',
          link: '/operator?tab=inspection-binder',
        });
      }

      toast({ title: 'Document assigned', description: `${doc.name} has been added to ${driverName}'s binder.` });
      setStagingAssignMap(prev => { const n = { ...prev }; delete n[doc.id]; return n; });
      fetchDocs();
    } catch (err: any) {
      toast({ title: 'Assignment failed', description: err.message, variant: 'destructive' });
    } finally {
      setAssigningStaged(null);
    }
  };

  const selectedDriverName = operatorName ?? operators.find(o => o.userId === selectedDriverId)?.name ?? '';

  const unsharedDocs = companyDocs.filter(d => d.file_url && !d.shared_with_fleet);
  const sharedDocs = companyDocs.filter(d => d.file_url && d.shared_with_fleet);

  const missingOrExpiredDriverDocs = PER_DRIVER_DOCS.filter(({ key, hasExpiry }) => {
    const doc = perDriverDocs.find(d => d.name === key);
    if (!doc?.file_url) return true;
    if (hasExpiry && doc.expires_at) {
      const days = Math.ceil((parseLocalDate(doc.expires_at).getTime() - Date.now()) / 86400000);
      if (days < 0) return true;
    }
    return false;
  });

  const sendDriverDocReminder = async (docName: string | 'all') => {
    if (!selectedDriverId) return;
    setSendingReminder(docName);
    setReminderDialogDoc(null);
    try {
      const targetUserId = selectedDriverId;

      // Resolve operator row id for cert_reminders
      const { data: opRow } = await supabase
        .from('operators')
        .select('id')
        .eq('user_id', selectedDriverId)
        .maybeSingle();
      const operatorRowId = opRow?.id ?? null;

      const docsToRemind = docName === 'all'
        ? missingOrExpiredDriverDocs.map(d => d.key)
        : [docName];

      if (docsToRemind.length === 0) {
        toast({ title: 'No documents to remind', description: 'All per-driver documents are present and valid.' });
        return;
      }

      const docList = docsToRemind.join(', ');
      const isSingle = docsToRemind.length === 1;

      // Resolve current staff name for the record
      const { data: profileRow } = await supabase
        .from('profiles')
        .select('first_name, last_name')
        .eq('user_id', user?.id)
        .maybeSingle();
      const senderName = profileRow
        ? [profileRow.first_name, profileRow.last_name].filter(Boolean).join(' ') || 'Staff'
        : 'Staff';

      await Promise.all([
        supabase.from('notifications').insert({
          user_id: targetUserId,
          title: isSingle
            ? `Action required: ${docsToRemind[0]}`
            : `Action required: ${docsToRemind.length} binder documents`,
          body: isSingle
            ? `Your ${docsToRemind[0]} in the Inspection Binder is ${
                perDriverDocs.find(d => d.name === docsToRemind[0])?.file_url ? 'expired or needs renewal' : 'missing'
              }. Please upload an updated copy.`
            : `The following documents in your Inspection Binder need attention: ${docList}. Please upload updated copies.`,
          type: 'document_update',
          channel: 'in_app',
          link: '/operator?tab=inspection-binder',
        }),
        // Record one cert_reminders row per doc for "last reminded" history
        operatorRowId
          ? supabase.from('cert_reminders').insert(
              docsToRemind.map(d => ({
                operator_id: operatorRowId,
                doc_type: d,
                sent_by: user?.id ?? null,
                sent_by_name: senderName,
                email_sent: false,
              }))
            )
          : Promise.resolve(),
      ]);

      // Optimistically update lastReminders state
      const now = new Date().toISOString();
      setLastReminders(prev => {
        const next = { ...prev };
        docsToRemind.forEach(d => { next[d] = { doc_type: d, sent_at: now, sent_by_name: senderName }; });
        return next;
      });

      toast({
        title: isSingle ? 'Reminder sent' : `${docsToRemind.length} reminders sent`,
        description: `${selectedDriverName || 'The operator'} has been notified via their in-app notifications.`,
      });
    } catch (err: any) {
      toast({ title: 'Failed to send reminder', description: err.message, variant: 'destructive' });
    } finally {
      setSendingReminder(null);
    }
  };

  const handleShareAll = async () => {
    if (unsharedDocs.length === 0) return;
    setSharingAll(true);
    setShareAllDialogOpen(false);
    try {
      await Promise.all(unsharedDocs.map(doc =>
        supabase.from('inspection_documents').update({ shared_with_fleet: true }).eq('id', doc.id)
      ));
      toast({
        title: `${unsharedDocs.length} document${unsharedDocs.length > 1 ? 's' : ''} shared with fleet`,
        description: 'All uploaded company documents are now visible to drivers.',
      });
      fetchDocs();
    } catch {
      toast({ title: 'Error sharing documents', variant: 'destructive' });
    } finally {
      setSharingAll(false);
    }
  };

  const handleUnshareAll = async () => {
    if (sharedDocs.length === 0) return;
    setUnsharingAll(true);
    setUnshareAllDialogOpen(false);
    try {
      await Promise.all(sharedDocs.map(doc =>
        supabase.from('inspection_documents').update({ shared_with_fleet: false }).eq('id', doc.id)
      ));
      toast({
        title: `${sharedDocs.length} document${sharedDocs.length > 1 ? 's' : ''} removed from fleet`,
        description: 'Drivers will no longer see these documents in their binder.',
      });
      fetchDocs();
    } catch {
      toast({ title: 'Error unsharing documents', variant: 'destructive' });
    } finally {
      setUnsharingAll(false);
    }
  };

  const toggleFleetShare = async (doc: InspectionDocument) => {
    const newVal = !doc.shared_with_fleet;
    await supabase.from('inspection_documents').update({ shared_with_fleet: newVal }).eq('id', doc.id);
    toast({ title: newVal ? 'Shared with fleet' : 'Removed from fleet', description: `${doc.name} is now ${newVal ? 'visible to all drivers' : 'hidden from drivers'}.` });
    fetchDocs();
  };

  const AdminDocRow = ({ docName, scope, hasExpiry, onRemind, remindLoading, lastReminder, cooldown }: {
    docName: string;
    scope: 'company_wide' | 'per_driver';
    hasExpiry: boolean;
    onRemind?: () => void;
    remindLoading?: boolean;
    lastReminder?: ReminderRecord;
    cooldown?: boolean;
  }) => {
    const doc = scope === 'company_wide'
      ? companyDocs.find(d => d.name === docName)
      : perDriverDocs.find(d => d.name === docName);
    const rowKey = `${scope}-${docName}`;

    // Badge: per-driver docs whose file was copied from a company doc are managed at the company level
    const isSharedFromCompany = scope === 'per_driver' && doc?.file_url
      && companyDocs.some(c => c.name === docName && c.file_url);
    const isShareOpen = shareToDriverOpen === (doc?.id ?? `new-${docName}`);
    const isSelected = doc?.id ? bulkSelected.has(doc.id) : false;
    const [linkCopied, setLinkCopied] = useState(false);

    const handleCopyLink = async () => {
      if (!doc?.public_share_token) return;
      const shareUrl = `${window.location.origin}/inspect/${doc.public_share_token}`;
      await navigator.clipboard.writeText(shareUrl);
      setLinkCopied(true);
      toast({ title: 'Share link copied!', description: docName });
      setTimeout(() => setLinkCopied(false), 2000);
    };

    return (
      <div className={`bg-card border rounded-xl p-4 space-y-3 transition-colors ${isSelected ? 'border-info/60 bg-info/5' : 'border-border'}`}>
        <div className="flex items-start gap-3">
          {/* Bulk-select checkbox — only for company docs that have a file */}
          {scope === 'company_wide' && doc?.id && doc?.file_url && (
            <Checkbox
              checked={isSelected}
              onCheckedChange={(checked) => {
                setBulkSelected(prev => {
                  const next = new Set(prev);
                  checked ? next.add(doc.id) : next.delete(doc.id);
                  return next;
                });
              }}
              className="mt-1 shrink-0"
            />
          )}
          {/* Spacer to keep alignment for rows without checkbox */}
          {scope === 'company_wide' && doc?.id && !doc?.file_url && (
            <div className="w-4 shrink-0 mt-1" />
          )}
          <div className={`h-9 w-9 rounded-lg shrink-0 flex items-center justify-center ${doc?.file_url ? 'bg-gold/10' : 'bg-secondary'}`}>
            <FileText className={`h-4 w-4 ${doc?.file_url ? 'text-gold-muted' : 'text-muted-foreground'}`} />
          </div>
          <div className="flex-1 min-w-0">
            {/* Title row */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-sm font-medium text-foreground">{docName}</span>
                {!doc?.file_url && (
                  <Badge variant="secondary" className="text-[10px]">No file</Badge>
                )}
                {doc?.file_url && hasExpiry && (
                  isInspectionDateDoc(docName)
                    ? <InspectedBadge inspectionDate={doc.expires_at} />
                    : <ExpiryBadge expiresAt={doc.expires_at} />
                )}
                {doc?.file_url && !hasExpiry && <OnFileBadge />}
                {doc?.shared_with_fleet && (
                  <span className="inline-flex items-center gap-1 text-[10px] bg-info/10 text-info border border-info/30 rounded-full px-2 py-0.5 font-semibold">
                    <Users className="h-3 w-3" />Fleet
                  </span>
                )}
                {scope === 'company_wide' && (() => {
                  const count = perDriverShareCounts[docName] ?? 0;
                  const names = perDriverShareNames[docName] ?? [];
                  return count > 0 ? (
                    <Tooltip delayDuration={150}>
                      <TooltipTrigger asChild>
                        <span className="inline-flex items-center gap-1 text-[10px] bg-secondary text-muted-foreground border border-border rounded-full px-2 py-0.5 font-medium cursor-default">
                          <UserCheck className="h-3 w-3" />Shared with {count} {count === 1 ? 'driver' : 'drivers'}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs text-left space-y-1 max-w-[200px]">
                        <p className="font-semibold text-foreground">Shared with:</p>
                        {names.map(name => (
                          <p key={name} className="text-muted-foreground">• {name}</p>
                        ))}
                      </TooltipContent>
                    </Tooltip>
                  ) : null;
                })()}
                {isSharedFromCompany && (
                  <span className="inline-flex items-center gap-1 text-[10px] bg-gold/10 text-gold-muted border border-gold/30 rounded-full px-2 py-0.5 font-semibold">
                    <Globe className="h-3 w-3" />Shared from company
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {onRemind && (
                  <Tooltip delayDuration={200}>
                    <TooltipTrigger asChild>
                      <span className={cooldown ? 'cursor-not-allowed' : undefined}>
                        <Button
                          size="sm"
                          variant="outline"
                          className={cn(
                            'h-8 gap-1 text-xs',
                            cooldown
                              ? 'border-border text-muted-foreground opacity-50 pointer-events-none'
                              : 'border-gold/40 text-gold-muted hover:bg-gold/10 hover:text-gold',
                          )}
                          disabled={remindLoading || cooldown}
                          onClick={cooldown ? undefined : onRemind}
                        >
                          {remindLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bell className="h-3 w-3" />}
                          Remind
                        </Button>
                      </span>
                    </TooltipTrigger>
                    {cooldown && (
                      <TooltipContent side="top" className="text-xs">
                        Reminder sent today
                      </TooltipContent>
                    )}
                  </Tooltip>
                )}
                {doc?.file_url && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    onClick={() => { setPreviewUrl(doc.file_url!); setPreviewName(docName); setPreviewFilePath(doc.file_path ?? null); }}
                    title="Preview"
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                )}
                {doc?.file_url && doc?.public_share_token && (
                  <Tooltip delayDuration={150}>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0"
                        onClick={handleCopyLink}
                      >
                        {linkCopied
                          ? <Check className="h-3.5 w-3.5 text-status-complete" />
                          : <Copy className="h-3.5 w-3.5" />
                        }
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      {linkCopied ? 'Copied!' : 'Copy share link'}
                    </TooltipContent>
                  </Tooltip>
                )}
                {doc && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                    onClick={() => setDeleteTarget(doc)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
                <input
                  ref={el => { fileRefs.current[rowKey] = el; }}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) handleUpload(docName, scope, f, doc?.id);
                    e.target.value = '';
                  }}
                />
                {isSharedFromCompany ? (
                  <Tooltip delayDuration={100}>
                    <TooltipTrigger asChild>
                      <span className="cursor-not-allowed">
                        <Button
                          size="sm"
                          className="h-8 gap-1.5 text-xs opacity-40 pointer-events-none"
                          variant={doc?.file_url ? 'outline' : 'default'}
                          disabled
                        >
                          <Upload className="h-3 w-3" />
                          {doc?.file_url ? 'Replace' : 'Upload'}
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      Managed from Company Docs
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <Button
                    size="sm"
                    className={`h-8 gap-1.5 text-xs ${!doc?.file_url ? 'bg-gold text-surface-dark hover:bg-gold-light' : ''}`}
                    variant={doc?.file_url ? 'outline' : 'default'}
                    disabled={uploading === docName}
                    onClick={() => fileRefs.current[rowKey]?.click()}
                  >
                    {uploading === docName ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                    {doc?.file_url ? 'Replace' : 'Upload'}
                  </Button>
                )}
              </div>
            </div>

            {/* Fleet share toggle — company-wide docs with a file only */}
            {scope === 'company_wide' && doc?.file_url && (
              <>
                <div className="flex items-center justify-between pt-2 border-t border-border/50 mt-2">
                  <div className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Share with all fleet drivers</span>
                  </div>
                  <Switch
                    checked={doc.shared_with_fleet}
                    onCheckedChange={() => toggleFleetShare(doc)}
                  />
                </div>

                {/* Share to specific driver */}
                <div className="pt-1.5">
                  {!isShareOpen ? (
                    <button
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => { setShareToDriverOpen(doc.id); setShareToDriverTarget(''); }}
                    >
                      <UserCheck className="h-3.5 w-3.5" />
                      Share to specific driver…
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 mt-1">
                      <Select value={shareToDriverTarget} onValueChange={setShareToDriverTarget}>
                        <SelectTrigger className="h-8 text-xs flex-1">
                          <SelectValue placeholder="Select driver…" />
                        </SelectTrigger>
                        <SelectContent>
                          {operators.map(op => (
                            <SelectItem key={op.userId} value={op.userId}>{op.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        className="h-8 gap-1 text-xs bg-info text-white hover:bg-info/90 shrink-0"
                        disabled={!shareToDriverTarget || sharingToDriver}
                        onClick={() => handleShareToDriver(doc)}
                      >
                        {sharingToDriver ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserCheck className="h-3 w-3" />}
                        Send
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-muted-foreground"
                        onClick={() => { setShareToDriverOpen(null); setShareToDriverTarget(''); }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Expiry editor */}
            {hasExpiry && (
              <div className="mt-2 flex items-center gap-2">
                {expiryEditing === doc?.id ? (
                  <>
                    <DateInput
                      value={expiryValue}
                      onChange={v => setExpiryValue(v)}
                      className="h-7 text-xs w-44"
                    />
                    <Button size="sm" className="h-7 text-xs" onClick={() => saveExpiry(doc!.id)}>Save</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setExpiryEditing(null)}>Cancel</Button>
                  </>
                ) : (
                  <button
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => { if (doc) { setExpiryEditing(doc.id); setExpiryValue(doc.expires_at ?? ''); } }}
                  >
                    <Calendar className="h-3.5 w-3.5" />
                    {doc?.expires_at
                      ? `${isInspectionDateDoc(docName) ? 'Inspection Date' : 'Expires'} ${parseLocalDate(doc.expires_at).toLocaleDateString()}`
                      : (isInspectionDateDoc(docName) ? 'Set inspection date' : 'Set expiry date')}
                  </button>
                )}
              </div>
            )}

            {/* Last Reminded — per-driver docs only */}
            {scope === 'per_driver' && lastReminder && (
              <div className="flex items-center gap-1.5 pt-1.5 border-t border-border/40 mt-1">
                <Bell className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                <span className="text-[11px] text-muted-foreground">
                  Last reminded{' '}
                  <span className="font-medium text-foreground/70">
                    {new Date(lastReminder.sent_at).toLocaleDateString(undefined, {
                      month: 'short', day: 'numeric', year: 'numeric',
                    })}
                  </span>
                  {lastReminder.sent_by_name && (
                    <> by <span className="font-medium text-foreground/70">{lastReminder.sent_by_name}</span></>
                  )}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const sharedCount = companyDocs.filter(d => d.shared_with_fleet).length;
  const totalCompany = COMPANY_WIDE_DOCS.length;

  // Count per-driver docs that were shared from company docs for the selected driver
  const companyDocNames = new Set(COMPANY_WIDE_DOCS.map(d => d.key));
  const sharedFromCompanyDocs = selectedDriverId
    ? perDriverDocs.filter(d => companyDocNames.has(d.name as any) && d.file_url)
    : [];
  const sharedFromCompanyCount = sharedFromCompanyDocs.length;

  const tabs = [
    {
      key: 'company' as const,
      label: 'Company Docs',
      icon: <Globe className="h-3.5 w-3.5" />,
      badge: `${sharedCount} of ${totalCompany} shared`,
      badgeActive: sharedCount > 0,
    },
    {
      key: 'driver' as const,
      label: 'Driver Docs',
      icon: <User className="h-3.5 w-3.5" />,
      badge: sharedFromCompanyCount > 0 ? `${sharedFromCompanyCount} from company` : undefined,
      badgeActive: sharedFromCompanyCount > 0,
    },
    { key: 'uploads' as const, label: 'Driver Uploads', icon: <Upload className="h-3.5 w-3.5" /> },
    {
      key: 'staging' as const,
      label: 'Staging',
      icon: <Inbox className="h-3.5 w-3.5" />,
      badge: stagedDocs.length > 0 ? `${stagedDocs.length} unassigned` : undefined,
      badgeActive: stagedDocs.length > 0,
    },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-xl bg-gold/10 flex items-center justify-center shrink-0">
          <FileText className="h-4 w-4 text-gold" />
        </div>
        <div>
          <h2 className="text-base font-bold text-foreground">Inspection Binder</h2>
          {selectedDriverName && <p className="text-xs text-muted-foreground">{selectedDriverName}</p>}
        </div>
      </div>

      {/* Driver selector (non-scoped) */}
      {!operatorUserId && (
        <div
          className={
            selectedDriverId
              ? "rounded-xl p-3 bg-card border border-border transition-all"
              : "rounded-xl p-3 bg-gold/5 border-2 border-dashed border-gold/40 transition-all"
          }
        >
          <div className="flex items-center gap-1.5 mb-2">
            <UserCircle2
              className={
                selectedDriverId
                  ? "h-3.5 w-3.5 text-muted-foreground"
                  : "h-3.5 w-3.5 text-gold animate-pulse"
              }
            />
            <span
              className={
                selectedDriverId
                  ? "text-xs text-muted-foreground"
                  : "text-xs font-semibold text-gold"
              }
            >
              {selectedDriverId ? "Managing binder for:" : "Choose a driver to begin"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Select value={selectedDriverId} onValueChange={setSelectedDriverId}>
              <SelectTrigger
                className={
                  selectedDriverId
                    ? "flex-1"
                    : "flex-1 h-11 text-sm font-medium border-gold/30 bg-card [&>span]:text-foreground"
                }
              >
                <SelectValue placeholder="Select a driver to manage their binder…" />
              </SelectTrigger>
              <SelectContent>
                {operators.map(op => (
                  <SelectItem key={op.userId} value={op.userId}>{op.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedDriverId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFlipbookOpen(true)}
                className="gap-1.5 shrink-0"
              >
                <BookOpen className="h-3.5 w-3.5" />
                View as Flipbook
              </Button>
            )}
          </div>
        </div>
      )}
      {operatorUserId && selectedDriverId && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setFlipbookOpen(true)}
          className="gap-1.5 w-full sm:w-auto"
        >
          <BookOpen className="h-3.5 w-3.5" />
          View as Flipbook
        </Button>
      )}

      {/* Tabs */}
      <TooltipProvider>
        <div className="grid grid-cols-4 gap-1 bg-secondary rounded-xl p-1">
          {tabs.map(t => {
            const isDriverTab = t.key === 'driver' && sharedFromCompanyCount > 0;
            const btn = (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`flex flex-col items-center justify-center gap-0.5 text-xs font-medium py-2 rounded-lg transition-colors w-full ${
                  activeTab === t.key ? 'bg-card text-foreground shadow-sm border border-border' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className="flex items-center gap-1">{t.icon}{t.label}</span>
                {'badge' in t && t.badge && (
                  <span className={`text-[10px] font-semibold px-1.5 py-0 rounded-full leading-tight ${
                    t.badgeActive ? 'bg-info/15 text-info' : 'bg-muted text-muted-foreground'
                  }`}>
                    {t.badge}
                  </span>
                )}
              </button>
            );

            if (isDriverTab) {
              return (
                <Tooltip key={t.key}>
                  <TooltipTrigger asChild>{btn}</TooltipTrigger>
                  <TooltipContent side="bottom" className="text-left space-y-1 max-w-[200px]">
                    <p className="font-bold text-xs">Shared from company:</p>
                    <ul className="space-y-0.5">
                      {sharedFromCompanyDocs.map(d => (
                        <li key={d.id} className="text-xs text-muted-foreground leading-tight">• {d.name}</li>
                      ))}
                    </ul>
                  </TooltipContent>
                </Tooltip>
              );
            }

            return btn;
          })}
        </div>
      </TooltipProvider>

      {/* Status color key — staff reference */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-1">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mr-1">Key:</span>
        <span className="inline-flex items-center gap-1 text-[10px] text-status-complete font-medium"><span className="h-2 w-2 rounded-full bg-status-complete inline-block" />Valid — uploaded, not expired</span>
        <span className="inline-flex items-center gap-1 text-[10px] text-info font-medium"><span className="h-2 w-2 rounded-full bg-info inline-block" />On File — uploaded, no expiry tracked</span>
        <span className="inline-flex items-center gap-1 text-[10px] text-warning font-medium"><span className="h-2 w-2 rounded-full bg-warning inline-block" />Expiring Soon — within 30 days</span>
        <span className="inline-flex items-center gap-1 text-[10px] text-destructive font-medium"><span className="h-2 w-2 rounded-full bg-destructive inline-block" />Expired</span>
        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground font-medium"><span className="h-2 w-2 rounded-full bg-muted-foreground/40 inline-block" />No File — awaiting upload</span>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
      ) : (
        <>
          {/* ── Company Docs ── */}
          {activeTab === 'company' && (() => {
            const selectableDocIds = companyDocs.filter(d => d.file_url).map(d => d.id);
            const allSelected = selectableDocIds.length > 0 && selectableDocIds.every(id => bulkSelected.has(id));
            const someSelected = selectableDocIds.some(id => bulkSelected.has(id));
            const handleSelectAll = (checked: boolean | 'indeterminate') => {
              setBulkSelected(checked === true
                ? new Set(selectableDocIds)
                : new Set()
              );
            };
            return (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {selectableDocIds.length > 0 && (
                    <Checkbox
                      checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                      onCheckedChange={handleSelectAll}
                      aria-label="Select all uploaded documents"
                      className="shrink-0"
                    />
                  )}
                  <p className="text-xs text-muted-foreground">
                    These documents apply to all drivers. Upload here, then share fleet-wide or to a specific driver.
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {sharedDocs.length > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1.5 text-xs border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={unsharingAll}
                      onClick={() => setUnshareAllDialogOpen(true)}
                    >
                      {unsharingAll ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                      Unshare All
                    </Button>
                  )}
                  {unsharedDocs.length > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1.5 text-xs border-info/40 text-info hover:bg-info/10 hover:text-info"
                      disabled={sharingAll}
                      onClick={() => setShareAllDialogOpen(true)}
                    >
                      {sharingAll ? <Loader2 className="h-3 w-3 animate-spin" /> : <Share2 className="h-3 w-3" />}
                      Share All
                    </Button>
                  )}
                </div>
              </div>

              {/* Bulk-select action bar */}
              {bulkSelected.size > 0 && (
                <div className="flex items-center justify-between gap-2 bg-info/10 border border-info/30 rounded-xl px-3 py-2">
                  <div className="flex items-center gap-2">
                    <CheckSquare className="h-4 w-4 text-info shrink-0" />
                    <span className="text-xs font-medium text-info">
                      {bulkSelected.size} document{bulkSelected.size > 1 ? 's' : ''} selected
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-muted-foreground"
                      onClick={() => setBulkSelected(new Set())}
                    >
                      <X className="h-3 w-3 mr-1" />Clear
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 gap-1.5 text-xs bg-info text-info-foreground hover:bg-info/90"
                      onClick={() => { setBulkShareTarget(''); setBulkDiff({}); setBulkShareStep('select'); setBulkShareDialogOpen(true); }}
                    >
                      <UserCheck className="h-3 w-3" />
                      Share to Driver
                    </Button>
                  </div>
                </div>
              )}

              <DragDropContext onDragEnd={(result: DropResult) => {
                if (!result.destination) return;
                const items = [...companyOrder];
                const [moved] = items.splice(result.source.index, 1);
                items.splice(result.destination.index, 0, moved);
                saveOrder('company_wide', items);
              }}>
                <Droppable droppableId="company-docs">
                  {(provided) => (
                    <div ref={provided.innerRef} {...provided.droppableProps}>
                      {companyOrder.map((key, index) => {
                        const spec = COMPANY_WIDE_DOCS.find(d => d.key === key);
                        if (!spec) return null;
                        const isOptional = isOptionalCompanyDoc(key);
                        return (
                          <Draggable key={key} draggableId={`company-${key}`} index={index}>
                            {(dragProvided, snapshot) => (
                              <div
                                ref={(el) => { dragProvided.innerRef(el); companyDocRowRefs.current[key] = el; }}
                                {...dragProvided.draggableProps}
                                className={snapshot.isDragging ? 'opacity-90 shadow-lg rounded-xl' : ''}
                              >
                                <div className="flex items-center gap-1">
                                  <div {...dragProvided.dragHandleProps} className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground/40 hover:text-muted-foreground">
                                    <GripVertical className="h-4 w-4" />
                                  </div>
                                  {isOptional && (
                                    <Tooltip delayDuration={150}>
                                      <TooltipTrigger asChild>
                                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/40 border border-border/60 cursor-help shrink-0">
                                          <Switch checked={false} disabled className="pointer-events-none scale-75 origin-center data-[state=unchecked]:bg-muted-foreground/30" />
                                          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Optional</span>
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent side="top" className="text-xs max-w-[220px]">
                                        Hidden from drivers by default. Enable per driver in the Per-Driver tab.
                                      </TooltipContent>
                                    </Tooltip>
                                  )}
                                  <div className="flex-1">
                                    <AdminDocRow docName={key} scope="company_wide" hasExpiry={spec.hasExpiry} />
                                  </div>
                                </div>
                              </div>
                            )}
                          </Draggable>
                        );
                      })}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            </div>
            );
          })()}

          {/* ── Driver Docs ── */}
          {activeTab === 'driver' && (
            <div className="space-y-3">
              {!selectedDriverId && (
                <div className="text-center py-8 text-muted-foreground text-sm border border-dashed border-border rounded-xl">
                  Select a driver above to manage their personal documents.
                </div>
              )}
              {selectedDriverId && (
                <>
                  {/* Optional Add-ons (per-driver only) */}
                  <div className="bg-secondary/40 border border-border rounded-xl p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold text-foreground">Optional Add-ons</p>
                      <span className="text-[10px] text-muted-foreground">(this driver only)</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Enable specialized permits for drivers who haul hazmat or oversize loads. Hidden by default.
                    </p>
                    <div className="flex flex-col gap-1.5 pt-1">
                      {OPTIONAL_COMPANY_DOCS.map(name => (
                        <label key={name} className="flex items-center gap-2 cursor-pointer text-xs text-foreground">
                          <Checkbox
                            checked={enabledOptional.has(name)}
                            onCheckedChange={(checked) => {
                              if (guardDemo()) return;
                              setOptionalDoc(name, checked === true);
                              fetchDocs();
                            }}
                          />
                          <span>{name}</span>
                          {enabledOptional.has(name) && (
                            <Badge variant="secondary" className="text-[10px] ml-1">Enabled</Badge>
                          )}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      These documents are specific to this driver's binder.
                    </p>
                    {missingOrExpiredDriverDocs.length > 0 && (() => {
                      const allOnCooldown = missingOrExpiredDriverDocs.every(
                        d => isOnCooldown(lastReminders[d.key]?.sent_at)
                      );
                      return (
                        <Tooltip delayDuration={200}>
                          <TooltipTrigger asChild>
                            <span className={allOnCooldown ? 'cursor-not-allowed' : undefined}>
                              <Button
                                size="sm"
                                variant="outline"
                                className={cn(
                                  'h-7 gap-1.5 text-xs shrink-0',
                                  allOnCooldown
                                    ? 'border-border text-muted-foreground opacity-50 pointer-events-none'
                                    : 'border-gold/40 text-gold-muted hover:bg-gold/10 hover:text-gold',
                                )}
                                disabled={sendingReminder === 'all' || allOnCooldown}
                                onClick={allOnCooldown ? undefined : () => setReminderDialogDoc('all')}
                              >
                                {sendingReminder === 'all' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bell className="h-3 w-3" />}
                                Remind All ({missingOrExpiredDriverDocs.length})
                              </Button>
                            </span>
                          </TooltipTrigger>
                          {allOnCooldown && (
                            <TooltipContent side="top" className="text-xs">
                              Reminder sent today
                            </TooltipContent>
                          )}
                        </Tooltip>
                      );
                    })()}
                  </div>
                  <DragDropContext onDragEnd={(result: DropResult) => {
                    if (!result.destination) return;
                    const items = [...driverOrder];
                    const [moved] = items.splice(result.source.index, 1);
                    items.splice(result.destination.index, 0, moved);
                    saveOrder('per_driver', items);
                  }}>
                    <Droppable droppableId="driver-docs">
                      {(provided) => (
                        <div ref={provided.innerRef} {...provided.droppableProps}>
                          {driverOrder.map((key, index) => {
                            const spec = PER_DRIVER_DOCS.find(d => d.key === key);
                            if (!spec) return null;
                            const doc = perDriverDocs.find(d => d.name === key);
                            const isMissing = !doc?.file_url;
                            const isExpired = spec.hasExpiry && doc?.expires_at
                              ? Math.ceil((parseLocalDate(doc.expires_at).getTime() - Date.now()) / 86400000) < 0
                              : false;
                            const needsReminder = isMissing || isExpired;
                            const docCooldown = isOnCooldown(lastReminders[key]?.sent_at);
                            return (
                              <Draggable key={key} draggableId={`driver-${key}`} index={index}>
                                {(dragProvided, snapshot) => (
                                  <div
                                    ref={dragProvided.innerRef}
                                    {...dragProvided.draggableProps}
                                    className={snapshot.isDragging ? 'opacity-90 shadow-lg rounded-xl' : ''}
                                  >
                                    <div className="flex items-center gap-1">
                                      <div {...dragProvided.dragHandleProps} className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground/40 hover:text-muted-foreground">
                                        <GripVertical className="h-4 w-4" />
                                      </div>
                                      <div className="flex-1">
                                        <AdminDocRow
                                          docName={key}
                                          scope="per_driver"
                                          hasExpiry={spec.hasExpiry}
                                          onRemind={needsReminder ? () => setReminderDialogDoc(key) : undefined}
                                          remindLoading={sendingReminder === key}
                                          lastReminder={lastReminders[key]}
                                          cooldown={docCooldown}
                                        />
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </Draggable>
                            );
                          })}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </DragDropContext>

                  {/* Extra per-driver docs shared from company (name matches a company doc with a file) */}
                  {(() => {
                    const standardKeys = new Set(PER_DRIVER_DOCS.map(d => d.key));
                    const sharedFromCompany = perDriverDocs.filter(
                      d => !standardKeys.has(d.name as any) && companyDocs.some(c => c.name === d.name && c.file_url)
                    );
                    if (sharedFromCompany.length === 0) return null;
                    return (
                      <>
                        <div className="flex items-center gap-2 pt-1">
                          <Globe className="h-3 w-3 text-muted-foreground/60" />
                          <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Shared from Company Docs</span>
                          <div className="flex-1 h-px bg-border/60" />
                        </div>
                        {sharedFromCompany.map(doc => (
                          <div key={doc.id} className="space-y-1">
                            <AdminDocRow
                              docName={doc.name}
                              scope="per_driver"
                              hasExpiry={COMPANY_WIDE_DOCS.find(c => c.key === doc.name)?.hasExpiry ?? false}
                            />
                            {/* Go to Company Docs link */}
                            <button
                              className="flex items-center gap-1 text-[11px] text-info hover:text-info/70 transition-colors pl-1"
                              onClick={() => {
                                setActiveTab('company');
                                setTimeout(() => {
                                  const el = companyDocRowRefs.current[doc.name];
                                  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                  if (el) {
                                    el.style.transition = 'box-shadow 0.2s';
                                    el.style.boxShadow = '0 0 0 2px hsl(var(--info))';
                                    setTimeout(() => { el.style.boxShadow = ''; }, 1800);
                                  }
                                }, 80);
                              }}
                            >
                              <ArrowRight className="h-3 w-3" />
                              Go to Company Docs
                            </button>
                          </div>
                        ))}
                      </>
                    );
                  })()}
                </>
              )}
            </div>
          )}

          {/* ── Driver Uploads ── */}
          {activeTab === 'uploads' && (
            <div className="space-y-3">
              {!selectedDriverId && (
                <div className="text-center py-8 text-muted-foreground text-sm border border-dashed border-border rounded-xl">
                  Select a driver above to view their uploaded documents.
                </div>
              )}
              {selectedDriverId && driverUploads.length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-sm border border-dashed border-border rounded-xl">
                  No uploads from this driver yet.
                </div>
              )}
              {driverUploads.map(upload => (
                <div
                  key={upload.id}
                  className={cn(
                    'bg-card border rounded-xl p-4 transition-colors',
                    upload.status === 'reviewed' && 'border-status-complete/40 bg-status-complete/5',
                    upload.status === 'needs_attention' && 'border-destructive/40 bg-destructive/5',
                    upload.status === 'pending_review' && 'border-info/30',
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      'h-9 w-9 rounded-lg flex items-center justify-center shrink-0',
                      upload.status === 'reviewed' && 'bg-status-complete/10',
                      upload.status === 'needs_attention' && 'bg-destructive/10',
                      upload.status === 'pending_review' && 'bg-info/10',
                    )}>
                      <FileText className={cn(
                        'h-4 w-4',
                        upload.status === 'reviewed' && 'text-status-complete',
                        upload.status === 'needs_attention' && 'text-destructive',
                        upload.status === 'pending_review' && 'text-info',
                      )} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{upload.file_name ?? 'Document'}</p>
                          <p className="text-xs text-muted-foreground">
                            {UPLOAD_CATEGORY_LABELS[upload.category] ?? upload.category.replace(/_/g, ' ')} · {new Date(upload.uploaded_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <UploadStatusBadge status={upload.status} />
                          {upload.file_url && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                              onClick={() => { setPreviewUrl(upload.file_url!); setPreviewName(upload.file_name ?? 'Document'); setPreviewFilePath(upload.file_path ?? null); }}
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {upload.status !== 'reviewed' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1.5 text-xs border-status-complete/50 text-status-complete hover:bg-status-complete/10 hover:text-status-complete hover:border-status-complete"
                            onClick={() => updateUploadStatus(upload.id, 'reviewed')}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Mark Reviewed
                          </Button>
                        )}
                        {upload.status !== 'needs_attention' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1.5 text-xs border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive hover:border-destructive"
                            onClick={() => updateUploadStatus(upload.id, 'needs_attention')}
                          >
                            <AlertTriangle className="h-3.5 w-3.5" />
                            Needs Attention
                          </Button>
                        )}
                        {upload.status !== 'pending_review' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => updateUploadStatus(upload.id, 'pending_review')}
                          >
                            <RotateCcw className="h-3 w-3" />
                            Reset
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Staging ── */}
          {activeTab === 'staging' && (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">
                    Upload documents here before assigning them to a specific driver. Useful for cleaning up files received by email before placing them in a driver's binder.
                  </p>
                </div>
              </div>

              {/* Upload new staged doc */}
              <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                    <Inbox className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium text-foreground">Upload to Staging</p>
                </div>

                {!pendingStagedFile ? (
                  <>
                    <input
                      ref={stagingUploadRef}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      className="hidden"
                      onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) {
                          setPendingStagedFile(f);
                          setNewStagedLabel(f.name.replace(/\.[^/.]+$/, ''));
                        }
                        e.target.value = '';
                      }}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full h-9 gap-2 text-xs border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground/40"
                      onClick={() => stagingUploadRef.current?.click()}
                    >
                      <Upload className="h-3.5 w-3.5" />
                      Choose file to stage…
                    </Button>
                  </>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 px-3 py-2 bg-secondary rounded-lg">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-xs text-foreground truncate flex-1">{pendingStagedFile.name}</span>
                      <button onClick={() => setPendingStagedFile(null)} className="text-muted-foreground hover:text-foreground">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <Input
                      placeholder="Document label (e.g. CDL, Insurance renewal…)"
                      value={newStagedLabel}
                      onChange={e => setNewStagedLabel(e.target.value)}
                      className="h-8 text-xs"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1 h-8 gap-1.5 text-xs bg-gold text-surface-dark hover:bg-gold-light"
                        disabled={uploadingStaged || !newStagedLabel.trim()}
                        onClick={() => handleStagedUpload(pendingStagedFile, newStagedLabel)}
                      >
                        {uploadingStaged ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                        Upload to Staging
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setPendingStagedFile(null); setNewStagedLabel(''); }}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Staged doc list */}
              {stagedDocs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm border border-dashed border-border rounded-xl">
                  No staged documents. Upload a file above to get started.
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {stagedDocs.length} Unassigned Document{stagedDocs.length !== 1 ? 's' : ''}
                  </p>
                  {stagedDocs.map(doc => (
                    <div key={doc.id} className="bg-card border border-border rounded-xl p-4 space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="h-9 w-9 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              {stagingLabelMap[doc.id] !== undefined ? (
                                <div className="flex items-center gap-1.5">
                                  <Input
                                    value={stagingLabelMap[doc.id]}
                                    onChange={e => setStagingLabelMap(prev => ({ ...prev, [doc.id]: e.target.value }))}
                                    className="h-7 text-xs flex-1"
                                    onBlur={async () => {
                                      const newName = stagingLabelMap[doc.id].trim();
                                      if (newName && newName !== doc.name) {
                                        await supabase.from('inspection_documents').update({ name: newName }).eq('id', doc.id);
                                        fetchDocs();
                                      }
                                      setStagingLabelMap(prev => { const n = { ...prev }; delete n[doc.id]; return n; });
                                    }}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                      if (e.key === 'Escape') setStagingLabelMap(prev => { const n = { ...prev }; delete n[doc.id]; return n; });
                                    }}
                                    autoFocus
                                  />
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0 text-muted-foreground shrink-0"
                                    onClick={() => setStagingLabelMap(prev => { const n = { ...prev }; delete n[doc.id]; return n; })}
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              ) : (
                                <p className="text-sm font-medium text-foreground leading-snug">{doc.name}</p>
                              )}
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Staged {new Date(doc.uploaded_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {stagingLabelMap[doc.id] === undefined && (
                                <Tooltip delayDuration={200}>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                                      onClick={() => setStagingLabelMap(prev => ({ ...prev, [doc.id]: doc.name }))}
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="text-xs">Rename</TooltipContent>
                                </Tooltip>
                              )}
                              {doc.file_url && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                                  onClick={() => { setPreviewUrl(doc.file_url!); setPreviewName(doc.name); setPreviewFilePath(doc.file_path ?? null); }}
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                                onClick={() => setDeleteStagedTarget(doc)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>

                          {/* Assign to driver */}
                          <div className="flex items-center gap-2 pt-3 border-t border-border/50 mt-2">
                            <UserCheck className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <Select
                              value={stagingAssignMap[doc.id] ?? ''}
                              onValueChange={val => setStagingAssignMap(prev => ({ ...prev, [doc.id]: val }))}
                            >
                              <SelectTrigger className="h-8 text-xs flex-1">
                                <SelectValue placeholder="Select driver to assign…" />
                              </SelectTrigger>
                              <SelectContent>
                                {operators.map(op => (
                                  <SelectItem key={op.userId} value={op.userId}>{op.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              size="sm"
                              className="h-8 gap-1 text-xs bg-info text-white hover:bg-info/90 shrink-0"
                              disabled={!stagingAssignMap[doc.id] || assigningStaged === doc.id}
                              onClick={() => handleAssignStaged(doc)}
                            >
                              {assigningStaged === doc.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserCheck className="h-3 w-3" />}
                              Assign
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Delete confirm ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <strong>{deleteTarget?.name}</strong> from{' '}
              {deleteTarget?.scope === 'company_wide' ? "all driver binders" : "this driver's binder"}. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
              className="bg-destructive text-destructive-foreground"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Delete Staged confirm ── */}
      <AlertDialog open={!!deleteStagedTarget} onOpenChange={open => !open && setDeleteStagedTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Staged Document?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <strong>{deleteStagedTarget?.name}</strong> from staging. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteStagedTarget && handleDeleteStaged(deleteStagedTarget)}
              className="bg-destructive text-destructive-foreground"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Share All confirm ── */}
      <AlertDialog open={shareAllDialogOpen} onOpenChange={setShareAllDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Share {unsharedDocs.length} Document{unsharedDocs.length !== 1 ? 's' : ''} with Fleet?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>The following document{unsharedDocs.length !== 1 ? 's' : ''} will become visible to all fleet drivers:</p>
                <ul className="mt-1 space-y-1">
                  {unsharedDocs.map(d => (
                    <li key={d.id} className="flex items-center gap-2 text-foreground text-sm">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      {d.name}
                    </li>
                  ))}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleShareAll} className="bg-info text-white hover:bg-info/90">
              <Share2 className="h-3.5 w-3.5 mr-1.5" />
              Share All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Unshare All confirm ── */}
      <AlertDialog open={unshareAllDialogOpen} onOpenChange={setUnshareAllDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {sharedDocs.length} Document{sharedDocs.length !== 1 ? 's' : ''} from Fleet?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>The following document{sharedDocs.length !== 1 ? 's' : ''} will be hidden from all fleet drivers:</p>
                <ul className="mt-1 space-y-1">
                  {sharedDocs.map(d => (
                    <li key={d.id} className="flex items-center gap-2 text-foreground text-sm">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      {d.name}
                    </li>
                  ))}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleUnshareAll}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Unshare All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Send Reminder confirm ── */}
      <AlertDialog open={!!reminderDialogDoc} onOpenChange={open => !open && setReminderDialogDoc(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {reminderDialogDoc === 'all'
                ? `Remind ${selectedDriverName || 'Driver'} — ${missingOrExpiredDriverDocs.length} Document${missingOrExpiredDriverDocs.length !== 1 ? 's' : ''}`
                : `Remind ${selectedDriverName || 'Driver'} — ${reminderDialogDoc}`}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  An in-app notification will be sent to{' '}
                  <span className="font-medium text-foreground">{selectedDriverName || 'this driver'}</span>{' '}
                  asking them to upload the following{reminderDialogDoc === 'all' ? ' documents' : ' document'}:
                </p>

                {/* Single-doc detail */}
                {reminderDialogDoc && reminderDialogDoc !== 'all' && (() => {
                  const singleDoc = perDriverDocs.find(pd => pd.name === reminderDialogDoc);
                  const isMissing = !singleDoc?.file_url;
                  const expiresAt = singleDoc?.expires_at ?? null;
                  const daysLeft = expiresAt
                    ? Math.ceil((parseLocalDate(expiresAt).getTime() - Date.now()) / 86400000)
                    : null;
                  return (
                    <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 flex items-center gap-3">
                      <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
                        isMissing ? 'bg-secondary' : 'bg-destructive/10'
                      }`}>
                        <FileText className={`h-4 w-4 ${isMissing ? 'text-muted-foreground' : 'text-destructive'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{reminderDialogDoc}</p>
                        <p className={`text-xs font-medium mt-0.5 ${isMissing ? 'text-muted-foreground' : 'text-destructive'}`}>
                          {isMissing
                            ? 'No file uploaded'
                            : daysLeft !== null && daysLeft < 0
                            ? `Expired ${formatDaysHuman(daysLeft!)} ago`
                              : 'Expired'}
                        </p>
                      </div>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                        isMissing
                          ? 'bg-secondary text-muted-foreground border border-border'
                          : 'bg-destructive/10 text-destructive border border-destructive/30'
                      }`}>
                        {isMissing ? 'Missing' : 'Expired'}
                      </span>
                    </div>
                  );
                })()}

                {/* Remind All doc list */}
                {reminderDialogDoc === 'all' && (
                  <div className="rounded-lg border border-border bg-muted/40 divide-y divide-border overflow-hidden">
                    {missingOrExpiredDriverDocs.map(d => {
                      const doc = perDriverDocs.find(pd => pd.name === d.key);
                      const isMissing = !doc?.file_url;
                      const expiresAt = doc?.expires_at ?? null;
                      const daysLeft = expiresAt
                        ? Math.ceil((parseLocalDate(expiresAt).getTime() - Date.now()) / 86400000)
                        : null;
                      return (
                        <div key={d.key} className="flex items-center gap-3 px-3 py-2.5">
                          <div className={`h-7 w-7 rounded-md flex items-center justify-center shrink-0 ${
                            isMissing ? 'bg-secondary' : 'bg-destructive/10'
                          }`}>
                            <FileText className={`h-3.5 w-3.5 ${isMissing ? 'text-muted-foreground' : 'text-destructive'}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground">{d.key}</p>
                            {!isMissing && daysLeft !== null && (
                              <p className="text-xs text-destructive font-medium">
                                {daysLeft < 0 ? `Expired ${formatDaysHuman(daysLeft)} ago` : `Expires in ${formatDaysHuman(daysLeft)}`}
                              </p>
                            )}
                          </div>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                            isMissing
                              ? 'bg-secondary text-muted-foreground border border-border'
                              : 'bg-destructive/10 text-destructive border border-destructive/30'
                          }`}>
                            {isMissing ? 'Missing' : 'Expired'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => reminderDialogDoc && sendDriverDocReminder(reminderDialogDoc)}
              className="bg-gold text-surface-dark hover:bg-gold-light"
            >
              <Bell className="h-3.5 w-3.5 mr-1.5" />
              Send Reminder{reminderDialogDoc === 'all' && missingOrExpiredDriverDocs.length > 1 ? 's' : ''}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Bulk Share to Driver Dialog (2-step) ── */}
      <AlertDialog open={bulkShareDialogOpen} onOpenChange={open => {
        if (!open) { setBulkShareStep('select'); setBulkDiff({}); }
        setBulkShareDialogOpen(open);
      }}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            {/* Step indicator */}
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                bulkShareStep === 'select'
                  ? 'bg-info/15 text-info border-info/30'
                  : 'bg-muted text-muted-foreground border-border'
              }`}>1 Select Driver</span>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                bulkShareStep === 'preview'
                  ? 'bg-info/15 text-info border-info/30'
                  : 'bg-muted text-muted-foreground border-border'
              }`}>2 Review Changes</span>
            </div>
            <AlertDialogTitle>
              {bulkShareStep === 'select'
                ? `Share ${bulkSelected.size} Document${bulkSelected.size > 1 ? 's' : ''} to a Driver`
                : `Review Changes for ${operators.find(o => o.userId === bulkShareTarget)?.name ?? 'Driver'}`}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 mt-1">
                {/* ── STEP 1: Select driver ── */}
                {bulkShareStep === 'select' && (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Choose a driver, then preview exactly what will change in their binder before sharing.
                    </p>
                    <div className="rounded-lg border border-border bg-muted/40 divide-y divide-border/60 overflow-hidden">
                      {companyDocs.filter(d => bulkSelected.has(d.id)).map(d => (
                        <div key={d.id} className="flex items-center gap-2 px-3 py-2">
                          <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-sm text-foreground">{d.name}</span>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-foreground">Choose driver:</p>
                      <Select value={bulkShareTarget} onValueChange={setBulkShareTarget}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select a driver…" />
                        </SelectTrigger>
                        <SelectContent>
                          {operators.map(op => (
                            <SelectItem key={op.userId} value={op.userId}>{op.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}

                {/* ── STEP 2: Diff preview ── */}
                {bulkShareStep === 'preview' && (() => {
                  const selectedDocs = companyDocs.filter(d => bulkSelected.has(d.id));
                  const newDocs = selectedDocs.filter(d => bulkDiff[d.id] === 'new');
                  const skipDocs = selectedDocs.filter(d => bulkDiff[d.id] === 'skip');
                  return (
                    <>
                      {newDocs.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          All selected documents are already in this driver's binder — nothing new will be added.
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          <span className="font-semibold text-status-complete">{newDocs.length}</span> document{newDocs.length > 1 ? 's' : ''} will be added.
                          {skipDocs.length > 0 && <> <span className="font-semibold text-muted-foreground">{skipDocs.length}</span> already exist{skipDocs.length === 1 ? 's' : ''} and will be skipped.</>}
                        </p>
                      )}
                      <div className="rounded-lg border border-border overflow-hidden divide-y divide-border/60">
                        {newDocs.map(d => (
                          <div key={d.id} className="flex items-center gap-2.5 px-3 py-2.5 bg-status-complete/5">
                            <div className="h-6 w-6 rounded-md bg-status-complete/15 flex items-center justify-center shrink-0">
                              <CheckCircle2 className="h-3.5 w-3.5 text-status-complete" />
                            </div>
                            <span className="text-sm text-foreground flex-1">{d.name}</span>
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-status-complete/15 text-status-complete border border-status-complete/30">
                              New
                            </span>
                          </div>
                        ))}
                        {skipDocs.map(d => (
                          <div key={d.id} className="flex items-center gap-2.5 px-3 py-2.5 bg-muted/30">
                            <div className="h-6 w-6 rounded-md bg-muted flex items-center justify-center shrink-0">
                              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                            </div>
                            <span className="text-sm text-muted-foreground flex-1">{d.name}</span>
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                              Already shared
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  );
                })()}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {bulkShareStep === 'select' ? (
              <>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <Button
                  disabled={!bulkShareTarget || bulkPreviewLoading}
                  onClick={() => loadBulkDiff(bulkShareTarget)}
                  className="bg-info text-info-foreground hover:bg-info/90"
                >
                  {bulkPreviewLoading
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Checking…</>
                    : <><ArrowRight className="h-3.5 w-3.5 mr-1.5" />Preview Changes</>}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setBulkShareStep('select')} disabled={bulkSharing}>
                  Back
                </Button>
                <Button
                  disabled={bulkSharing || Object.values(bulkDiff).every(v => v === 'skip')}
                  onClick={() => handleBulkShareToDriver()}
                  className="bg-info text-info-foreground hover:bg-info/90"
                >
                  {bulkSharing
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Sharing…</>
                    : <><UserCheck className="h-3.5 w-3.5 mr-1.5" />Confirm &amp; Share</>}
                </Button>
              </>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {previewUrl && (
        <FilePreviewModal
          url={previewUrl}
          name={previewName}
          onClose={() => { setPreviewUrl(null); setPreviewFilePath(null); }}
          bucketName={previewFilePath ? bucketForBinderDoc(previewFilePath) : undefined}
          filePath={previewFilePath ?? undefined}
          onSaved={() => fetchDocs()}
        />
      )}

      {flipbookOpen && selectedDriverId && (() => {
        const findCompanyDoc = (name: string) => companyDocs.find(d => d.name === name) ?? null;
        const findDriverDoc = (name: string) => perDriverDocs.find(d => d.name === name) ?? null;
        const uploadSubtitleMap: Record<string, string> = {
          roadside_inspection_report: 'Roadside Inspection Reports',
          repairs_maintenance_receipt: 'Repairs & Maintenance Receipts',
          miscellaneous: 'Miscellaneous',
        };
        const pages: FlipbookPage[] = [
          { id: 'cover', title: 'Cover Page', kind: 'cover', fileUrl: null },
          ...driverOrder.map((key): FlipbookPage | null => {
            const spec = PER_DRIVER_DOCS.find(d => d.key === key);
            if (!spec) return null;
            const doc = findDriverDoc(key);
            return {
              id: `d-${key}`,
              title: key,
              subtitle: 'Driver Document',
              fileUrl: doc?.file_url ?? null,
              fileName: doc?.file_url ?? null,
              shareToken: doc?.public_share_token ?? null,
              expiresAt: doc?.expires_at ?? null,
              filePath: doc?.file_path ?? null,
              bucket: 'inspection-documents',
              kind: 'doc' as const,
            };
          }).filter(Boolean) as FlipbookPage[],
          ...companyOrder.map((key): FlipbookPage | null => {
            const spec = COMPANY_WIDE_DOCS.find(d => d.key === key);
            if (!spec) return null;
            const doc = findCompanyDoc(key);
            return {
              id: `c-${key}`,
              title: key,
              subtitle: 'Company Document',
              fileUrl: doc?.file_url ?? null,
              fileName: doc?.file_url ?? null,
              shareToken: doc?.public_share_token ?? null,
              expiresAt: doc?.expires_at ?? null,
              filePath: doc?.file_path ?? null,
              bucket: 'inspection-documents',
              kind: 'doc' as const,
            };
          }).filter(Boolean) as FlipbookPage[],
          ...driverUploads.map((u): FlipbookPage => ({
            id: `u-${u.id}`,
            title: u.file_name || 'Upload',
            subtitle: uploadSubtitleMap[u.category] || 'Upload',
            fileUrl: u.file_url,
            fileName: u.file_name,
            shareToken: null,
            expiresAt: null,
            filePath: u.file_path ?? null,
            bucket: 'driver-uploads',
            kind: 'upload',
          })),
        ];
        return (
          <BinderFlipbook
            pages={pages}
            driverName={selectedDriverName || 'Driver'}
            unitNumber={unitNumber}
            onClose={() => setFlipbookOpen(false)}
          />
        );
      })()}
    </div>
  );
}
