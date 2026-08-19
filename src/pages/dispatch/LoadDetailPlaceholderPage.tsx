import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import LoadStatusBadge from '@/components/dispatch/LoadStatusBadge';
import type { LoadStatus } from '@/lib/loadFormat';

export default function LoadDetailPlaceholderPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ['dispatch-load', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('loads')
        .select('id, load_number, status')
        .eq('id', id as string)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" className="gap-1.5 -ml-2" onClick={() => navigate('/dispatch/loads')}>
        <ArrowLeft className="h-4 w-4" />
        Back to Loads
      </Button>

      <div className="rounded-lg border border-border bg-card p-6">
        {isLoading ? (
          <Skeleton className="h-7 w-48" />
        ) : error || !data ? (
          <p className="text-sm text-muted-foreground">This load could not be found.</p>
        ) : (
          <>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-semibold text-foreground font-mono">{data.load_number}</h1>
              <LoadStatusBadge status={data.status as LoadStatus} />
            </div>
            <p className="mt-3 text-sm text-muted-foreground">Load detail coming soon.</p>
          </>
        )}
      </div>
    </div>
  );
}