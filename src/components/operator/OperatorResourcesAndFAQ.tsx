import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { BookOpen, Download, FileText, HelpCircle, ChevronDown, ChevronUp, ExternalLink, Search, Eye, Share2, Mail } from 'lucide-react';
import { downloadBlob } from '@/lib/downloadBlob';
import { FilePreviewModal } from '@/components/inspection/DocRow';
import { useIsMobile } from '@/hooks/use-mobile';
import { useToast } from '@/hooks/use-toast';

const VIEWABLE_EXTENSIONS = /\.(pdf|png|jpe?g|gif|webp|svg|bmp)$/i;

function isViewableFile(fileName: string | null, fileUrl: string | null): boolean {
  const name = fileName || fileUrl || '';
  return VIEWABLE_EXTENSIONS.test(name);
}

async function handleShare(title: string, fileUrl: string) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text: `${title} — SUPERTRANSPORT`, url: fileUrl });
    } catch {
      // user cancelled
    }
  } else {
    window.location.href = `mailto:?subject=${encodeURIComponent(`${title} — SUPERTRANSPORT`)}&body=${encodeURIComponent(`Here is the document "${title}":\n\n${fileUrl}`)}`;
  }
}

// ─── Resource Library ──────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  user_manuals: '📖 User Manuals',
  decal_files: '🏷️ Decal Files',
  forms_compliance: '📋 Forms & Compliance',
  dot_general: '🚛 DOT General',
};

interface ResourceDoc {
  id: string;
  title: string;
  description: string | null;
  category: string;
  file_url: string | null;
  file_name: string | null;
}

export function OperatorResourceLibrary({ onReady }: { onReady?: () => void } = {}) {
  const [resources, setResources] = useState<ResourceDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [previewDoc, setPreviewDoc] = useState<ResourceDoc | null>(null);
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const readyFiredRef = useRef(false);

  useEffect(() => {
    supabase
      .from('resource_documents')
      .select('id, title, description, category, file_url, file_name')
      .eq('is_visible', true)
      .order('sort_order')
      .then(({ data }) => {
        setResources((data as ResourceDoc[]) ?? []);
        setLoading(false);
        if (!readyFiredRef.current) { readyFiredRef.current = true; onReady?.(); }
      });
  }, [onReady]);

  const filtered = resources.filter(r =>
    !search || r.title.toLowerCase().includes(search.toLowerCase()) || (r.description ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const byCategory = CATEGORY_LABELS
    ? Object.keys(CATEGORY_LABELS).reduce<Record<string, ResourceDoc[]>>((acc, cat) => {
        const items = filtered.filter(r => r.category === cat);
        if (items.length) acc[cat] = items;
        return acc;
      }, {})
    : {};

  return (
    <>
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold text-foreground">Resource Library</h2>
          <p className="text-sm text-muted-foreground mt-1">Download forms, manuals, and compliance documents.</p>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search resources…"
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-border rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-gold/30"
          />
        </div>

        {loading ? (
          <div className="py-12 text-center text-muted-foreground text-sm">Loading resources…</div>
        ) : Object.keys(byCategory).length === 0 ? (
          <div className="py-12 text-center">
            <BookOpen className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">{search ? 'No results found.' : 'No resources available yet.'}</p>
          </div>
        ) : (
          Object.entries(byCategory).map(([cat, docs]) => (
            <div key={cat}>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">{CATEGORY_LABELS[cat]}</h3>
              <div className="space-y-2">
                {docs.map(doc => (
                  <div key={doc.id} className="bg-white border border-border rounded-xl p-4 flex items-center gap-3 shadow-sm hover:shadow-md transition-shadow">
                    <div className="h-9 w-9 rounded-lg bg-gold/10 flex items-center justify-center shrink-0">
                      <FileText className="h-4 w-4 text-gold" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{doc.title}</p>
                      {doc.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{doc.description}</p>}
                    </div>
                    {doc.file_url && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isViewableFile(doc.file_name, doc.file_url) ? (
                          <button
                            onClick={() => setPreviewDoc(doc)}
                            className="flex items-center gap-1.5 text-xs font-medium text-gold hover:text-gold-light bg-gold/10 hover:bg-gold/15 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            <Eye className="h-3.5 w-3.5" /> View
                          </button>
                        ) : (
                          <button
                            onClick={() => downloadBlob(doc.file_url!, doc.file_name ?? 'download')}
                            className="flex items-center gap-1.5 text-xs font-medium text-gold hover:text-gold-light bg-gold/10 hover:bg-gold/15 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            <Download className="h-3.5 w-3.5" /> Download
                          </button>
                        )}
                        <button
                          onClick={() => handleShare(doc.title, doc.file_url!)}
                          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground bg-secondary hover:bg-secondary/80 px-3 py-1.5 rounded-lg transition-colors"
                          title="Share or email this file"
                        >
                          {isMobile ? <Share2 className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}
                          {isMobile ? 'Share' : 'Email'}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {previewDoc && (
        <FilePreviewModal
          url={previewDoc.file_url!}
          name={previewDoc.title}
          onClose={() => setPreviewDoc(null)}
        />
      )}
    </>
  );
}

// ─── FAQ ───────────────────────────────────────────────────────────────────

const FAQ_CATEGORY_LABELS: Record<string, string> = {
  application_process: 'Application Process',
  background_screening: 'Background Screening',
  documents_requirements: 'Documents & Requirements',
  ica_contracts: 'ICA Contracts',
  missouri_registration: 'Missouri Registration',
  equipment: 'Equipment',
  dispatch_operations: 'Dispatch & Operations',
  general_owner_operator: 'General Owner-Operator',
};

interface FaqItem {
  id: string;
  question: string;
  answer: string;
  category: string;
  sort_order: number;
}

export function OperatorFAQ() {
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');

  useEffect(() => {
    supabase
      .from('faq')
      .select('id, question, answer, category, sort_order')
      .eq('is_published', true)
      .order('sort_order')
      .then(({ data }) => {
        setFaqs((data as FaqItem[]) ?? []);
        setLoading(false);
      });
  }, []);

  const categories = ['all', ...Array.from(new Set(faqs.map(f => f.category)))];

  const filtered = faqs.filter(f => {
    const matchesSearch = !search || f.question.toLowerCase().includes(search.toLowerCase()) || f.answer.toLowerCase().includes(search.toLowerCase());
    const matchesCat = activeCategory === 'all' || f.category === activeCategory;
    return matchesSearch && matchesCat;
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">Frequently Asked Questions</h2>
        <p className="text-sm text-muted-foreground mt-1">Find answers to common questions about onboarding with SUPERTRANSPORT.</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search questions…"
          className="w-full pl-9 pr-4 py-2.5 text-sm border border-border rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-gold/30"
        />
      </div>

      {/* Category pills */}
      {categories.length > 2 && (
        <div className="flex gap-2 flex-wrap">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                activeCategory === cat
                  ? 'bg-surface-dark text-white'
                  : 'bg-white border border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {cat === 'all' ? 'All Topics' : FAQ_CATEGORY_LABELS[cat] ?? cat}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-muted-foreground text-sm">Loading FAQs…</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center space-y-4">
          <HelpCircle className="h-10 w-10 text-muted-foreground/30 mx-auto" />
          {search ? (
            <>
              <div>
                <p className="text-sm font-medium text-foreground">No results for "{search}"</p>
                <p className="text-xs text-muted-foreground mt-1">Try different keywords or browse by category.</p>
              </div>
              <div className="inline-flex flex-col items-center gap-2 bg-gold/10 border border-gold/30 rounded-xl px-6 py-4">
                <p className="text-xs font-medium text-foreground">Can't find what you're looking for?</p>
                <a
                  href="mailto:support@mysupertransport.com?subject=FAQ Question"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-gold hover:text-gold-light bg-gold/10 hover:bg-gold/20 px-4 py-2 rounded-lg transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Email Support
                </a>
              </div>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">No FAQs published yet.</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(faq => (
            <div key={faq.id} className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
              <button
                onClick={() => setOpen(open === faq.id ? null : faq.id)}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-secondary/30 transition-colors"
              >
                <p className="text-sm font-medium text-foreground pr-4">{faq.question}</p>
                {open === faq.id
                  ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                  : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                }
              </button>
              {open === faq.id && (
                <div className="px-4 pb-4 border-t border-border">
                  <p className="text-sm text-muted-foreground leading-relaxed pt-3 whitespace-pre-wrap">{faq.answer}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="bg-gold/10 border border-gold/30 rounded-xl p-4 text-center">
        <p className="text-sm font-medium text-foreground mb-1">Still have questions?</p>
        <p className="text-xs text-muted-foreground">
          Contact your onboarding coordinator or email{' '}
          <a href="mailto:support@mysupertransport.com" className="text-gold hover:underline">
            support@mysupertransport.com
          </a>
        </p>
      </div>
    </div>
  );
}
