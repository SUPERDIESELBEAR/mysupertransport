import { useState, useEffect, useCallback } from 'react';
import { Search, Plus, FileText, ShieldCheck, LayoutList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import DocumentCard from './DocumentCard';
import DocumentViewer from './DocumentViewer';
import AdminDocumentList from './AdminDocumentList';
import DocumentEditorModal from './DocumentEditorModal';
import ComplianceDashboard from './ComplianceDashboard';
import { DriverDocument, DocumentAcknowledgment, CATEGORIES, DocCategory } from './DocumentHubTypes';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface DocumentHubProps {
  isAdmin?: boolean;
  onAcknowledged?: () => void;
}

type AdminTab = 'documents' | 'compliance';

export default function DocumentHub({ isAdmin = false, onAcknowledged }: DocumentHubProps) {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<DriverDocument[]>([]);
  const [acknowledgments, setAcknowledgments] = useState<DocumentAcknowledgment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<DocCategory | 'All'>('All');
  const [viewingDoc, setViewingDoc] = useState<DriverDocument | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editDoc, setEditDoc] = useState<DriverDocument | null>(null);
  const [adminTab, setAdminTab] = useState<AdminTab>('documents');
  const [ackCounts, setAckCounts] = useState<Record<string, number>>({});
  const [totalDrivers, setTotalDrivers] = useState(0);

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('driver_documents')
      .select('*')
      .order('is_pinned', { ascending: false })
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (!isAdmin) {
      query = query.eq('is_visible', true);
    }

    const { data } = await query;
    setDocuments((data ?? []) as DriverDocument[]);
    setLoading(false);
  }, [isAdmin]);

  const fetchAcknowledgments = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('document_acknowledgments')
      .select('*')
      .eq('user_id', user.id);
    setAcknowledgments((data ?? []) as DocumentAcknowledgment[]);
  }, [user]);

  const fetchAckCounts = useCallback(async () => {
    if (!isAdmin) return;
    // Count unique users who acknowledged each doc at current version
    const { data } = await supabase
      .from('document_acknowledgments')
      .select('document_id, user_id, document_version');

    if (!data) return;

    const counts: Record<string, Set<string>> = {};
    data.forEach((ack: any) => {
      if (!counts[ack.document_id]) counts[ack.document_id] = new Set();
      counts[ack.document_id].add(ack.user_id);
    });

    const result: Record<string, number> = {};
    Object.entries(counts).forEach(([docId, users]) => {
      result[docId] = users.size;
    });
    setAckCounts(result);

    // Fetch driver count
    const { count } = await supabase
      .from('operators')
      .select('id', { count: 'exact', head: true });
    setTotalDrivers(count ?? 0);
  }, [isAdmin]);

  useEffect(() => {
    fetchDocuments();
    fetchAcknowledgments();
    if (isAdmin) fetchAckCounts();
  }, [fetchDocuments, fetchAcknowledgments, fetchAckCounts]);

  const handleRefresh = () => {
    fetchDocuments();
    if (isAdmin) fetchAckCounts();
    else fetchAcknowledgments();
  };

  // Filter for driver view
  const filteredDocs = documents.filter(doc => {
    if (activeCategory !== 'All' && doc.category !== activeCategory) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        doc.title.toLowerCase().includes(q) ||
        (doc.description ?? '').toLowerCase().includes(q) ||
        (doc.body ?? '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const getAck = (docId: string) =>
    acknowledgments.find(a => a.document_id === docId) ?? null;

  // Unacknowledged required docs count (for driver view badge)
  const unackedRequired = documents.filter(doc =>
    doc.is_required && doc.is_visible && (
      !getAck(doc.id) || getAck(doc.id)!.document_version < doc.version
    )
  ).length;

  // ── Document viewer ──────────────────────────────────────────────────────
  if (viewingDoc) {
    return (
      <DocumentViewer
        doc={viewingDoc}
        userId={user?.id ?? ''}
        acknowledgment={getAck(viewingDoc.id)}
        onBack={() => setViewingDoc(null)}
        onAcknowledged={() => { fetchAcknowledgments(); setViewingDoc(null); onAcknowledged?.(); }}
      />
    );
  }

  // ── ADMIN VIEW ────────────────────────────────────────────────────────────
  if (isAdmin) {
    return (
      <div className="space-y-5 animate-fade-in">
        <DocumentEditorModal
          open={editorOpen}
          onClose={() => { setEditorOpen(false); setEditDoc(null); }}
          doc={editDoc}
          onSaved={handleRefresh}
        />

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Document Hub</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage driver documents and track acknowledgments</p>
          </div>
          <Button onClick={() => { setEditDoc(null); setEditorOpen(true); }} className="gap-2 shrink-0">
            <Plus className="h-4 w-4" />
            New Document
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border">
          {([
            { key: 'documents', label: 'Documents', icon: <LayoutList className="h-4 w-4" /> },
            { key: 'compliance', label: 'Compliance', icon: <ShieldCheck className="h-4 w-4" /> },
          ] as { key: AdminTab; label: string; icon: React.ReactNode }[]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setAdminTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                adminTab === tab.key
                  ? 'border-gold text-gold'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.icon}{tab.label}
            </button>
          ))}
        </div>

        {/* Documents tab */}
        {adminTab === 'documents' && (
          loading ? (
            <div className="space-y-2">{[1,2,3,4].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
          ) : (
            <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
              <AdminDocumentList
                documents={documents}
                ackCounts={ackCounts}
                totalDrivers={totalDrivers}
                onEdit={doc => { setEditDoc(doc); setEditorOpen(true); }}
                onRefresh={handleRefresh}
              />
            </div>
          )
        )}

        {/* Compliance tab */}
        {adminTab === 'compliance' && (
          <ComplianceDashboard documents={documents} />
        )}
      </div>
    );
  }

  // ── DRIVER VIEW ───────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Document Hub</h1>
          {unackedRequired > 0 && (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-destructive bg-destructive/10 border border-destructive/30 rounded-full px-2.5 py-0.5">
              {unackedRequired} action{unackedRequired !== 1 ? 's' : ''} required
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Onboarding documents, policies, and reference materials
        </p>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search documents…"
          className="pl-9"
        />
      </div>

      {/* Category tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {(['All', ...CATEGORIES] as (DocCategory | 'All')[]).map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              activeCategory === cat
                ? 'bg-surface-dark text-white border-surface-dark'
                : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 bg-white'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Document grid */}
      {loading ? (
        <div className="grid sm:grid-cols-2 gap-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-48 w-full rounded-xl" />)}
        </div>
      ) : filteredDocs.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No documents found</p>
          {search && <p className="text-sm mt-1">Try a different search term or category.</p>}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {filteredDocs.map(doc => (
            <DocumentCard
              key={doc.id}
              doc={doc}
              acknowledgment={getAck(doc.id)}
              onView={setViewingDoc}
            />
          ))}
        </div>
      )}
    </div>
  );
}
