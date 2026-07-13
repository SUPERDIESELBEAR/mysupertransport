import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { LifeBuoy, Search, AlertTriangle, CheckCircle2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

interface StaffFaqHit {
  id: string;
  question: string;
  answer: string;
  category: string;
  tags: string[];
  last_verified_at: string;
  rank: number;
  headline: string;
}

const STALE_DAYS = 90;
const isStale = (iso: string) =>
  Date.now() - new Date(iso).getTime() > STALE_DAYS * 24 * 60 * 60 * 1000;

const CATEGORY_LABEL: Record<string, string> = {
  application_process: 'Application Process',
  background_screening: 'Background Screening',
  documents_requirements: 'Documents & Requirements',
  ica_contracts: 'ICA Contracts',
  missouri_registration: 'Missouri Registration',
  equipment: 'Equipment',
  dispatch_operations: 'Dispatch & Operations',
  general_owner_operator: 'General',
};

export default function StaffHelpPortal() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StaffFaqHit[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<string>('all');

  const runSearch = async (q: string) => {
    setLoading(true);
    const { data, error } = await supabase.rpc('search_staff_faqs', {
      q: q.trim() || '',
    });
    if (error) {
      console.error('search_staff_faqs failed', error);
      toast.error('Search failed.');
      setResults([]);
    } else {
      setResults((data as StaffFaqHit[]) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    const t = setTimeout(() => runSearch(query), 200);
    return () => clearTimeout(t);
  }, [query]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    results.forEach(r => set.add(r.category));
    return ['all', ...Array.from(set)];
  }, [results]);

  const filtered = results.filter(r =>
    category === 'all' ? true : r.category === category
  );

  const staleCount = results.filter(r => isStale(r.last_verified_at)).length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
          <LifeBuoy className="h-6 w-6 text-gold shrink-0" />
          Staff Help
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Searchable knowledge base for how to do things in SUPERDRIVE.
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="How do I revert an application, add a driver, edit pipeline stages…"
          className="pl-9 h-11 text-base"
        />
      </div>

      {/* Category chips */}
      {categories.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {categories.map(c => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                category === c
                  ? 'bg-gold text-surface-dark border-gold'
                  : 'bg-white text-muted-foreground border-border hover:border-gold/50'
              }`}
            >
              {c === 'all' ? 'All' : CATEGORY_LABEL[c] ?? c}
            </button>
          ))}
        </div>
      )}

      {/* Stale banner */}
      {staleCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {staleCount} article{staleCount === 1 ? '' : 's'} not verified in the last {STALE_DAYS} days.
          Content owners should re-review from the FAQ Manager.
        </div>
      )}

      {/* Results */}
      {loading ? (
        <div className="py-16 text-center text-muted-foreground text-sm">Searching…</div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <Sparkles className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">
            {query ? 'No matches. Try different keywords.' : 'No staff articles yet.'}
          </p>
        </div>
      ) : (
        <Accordion type="multiple" className="space-y-2">
          {filtered.map(hit => (
            <AccordionItem
              key={hit.id}
              value={hit.id}
              className="bg-white border border-border rounded-xl px-4 shadow-sm data-[state=open]:shadow-md transition-shadow"
            >
              <AccordionTrigger className="hover:no-underline py-3">
                <div className="flex-1 text-left min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <Badge variant="secondary" className="text-xs">
                      {CATEGORY_LABEL[hit.category] ?? hit.category}
                    </Badge>
                    {isStale(hit.last_verified_at) ? (
                      <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-200 gap-1">
                        <AlertTriangle className="h-3 w-3" /> Needs review
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200 gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Verified
                      </Badge>
                    )}
                    {(hit.tags ?? []).slice(0, 3).map(t => (
                      <Badge key={t} variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                        #{t}
                      </Badge>
                    ))}
                  </div>
                  <p
                    className="text-sm font-semibold text-foreground [&_mark]:bg-gold/30 [&_mark]:text-inherit [&_mark]:rounded [&_mark]:px-0.5"
                    dangerouslySetInnerHTML={{ __html: hit.headline || hit.question }}
                  />
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-4">
                <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                  {hit.answer}
                </p>
                <p className="text-[11px] text-muted-foreground mt-3">
                  Last verified {formatDistanceToNow(new Date(hit.last_verified_at), { addSuffix: true })}
                </p>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
}