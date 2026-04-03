import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Eye, Search, User } from 'lucide-react';
import OperatorPortal from '@/pages/operator/OperatorPortal';

interface OperatorOption {
  userId: string;
  name: string;
  unitNumber: string | null;
  isActive: boolean;
}

export default function OperatorPreviewPicker() {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const { data: operators = [], isLoading } = useQuery({
    queryKey: ['operator-preview-list'],
    queryFn: async () => {
      const { data } = await supabase
        .from('operators')
        .select(`
          user_id,
          is_active,
          unit_number,
          applications(first_name, last_name),
          onboarding_status(unit_number)
        `)
        .order('created_at', { ascending: false });

      if (!data) return [];
      return data.map((op: any) => {
        const app = Array.isArray(op.applications) ? op.applications[0] : op.applications;
        const os = Array.isArray(op.onboarding_status) ? op.onboarding_status[0] : op.onboarding_status;
        const name = [app?.first_name, app?.last_name].filter(Boolean).join(' ') || 'Unknown';
        const unitNumber = os?.unit_number ?? op.unit_number ?? null;
        return {
          userId: op.user_id,
          name,
          unitNumber,
          isActive: op.is_active,
        } as OperatorOption;
      });
    },
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return operators;
    const q = search.toLowerCase();
    return operators.filter(op =>
      op.name.toLowerCase().includes(q) ||
      (op.unitNumber && op.unitNumber.toLowerCase().includes(q))
    );
  }, [operators, search]);

  if (selectedUserId) {
    return (
      <div className="space-y-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSelectedUserId(null)}
          className="gap-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Change Operator
        </Button>
        <OperatorPortal previewUserId={selectedUserId} />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Eye className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold text-foreground">Operator Preview</h1>
        </div>
        <p className="text-sm text-muted-foreground">Select an operator to see their portal exactly as they see it — read-only.</p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name or unit number..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading operators…</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">No operators found.</div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(op => (
            <button
              key={op.userId}
              onClick={() => setSelectedUserId(op.userId)}
              className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card hover:bg-muted/50 hover:border-primary/30 transition-colors text-left group"
            >
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground truncate">{op.name}</p>
                <p className="text-xs text-muted-foreground">
                  {op.unitNumber ? `Unit ${op.unitNumber}` : 'No unit assigned'}
                  {!op.isActive && ' · Inactive'}
                </p>
              </div>
              <Eye className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
