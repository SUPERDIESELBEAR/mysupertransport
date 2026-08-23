import { useQuery } from '@tanstack/react-query';
import { Hash, HelpCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchLoadReferences } from '@/lib/loadReferences';
import { REFERENCE_CLASSES, type ReferenceClass } from '@/lib/referenceClasses';

/**
 * The reference numbers on file for this load, with the stops that cited them.
 *
 * Without this, a filed baseline was only inferable from a review screen that
 * showed no changes — the absence of a diff standing in for evidence that the
 * numbers were stored. They are stored; this shows them.
 */
export default function LoadReferencesCard({ loadId }: { loadId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['load-references', loadId],
    queryFn: () => fetchLoadReferences(loadId),
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Reference numbers</CardTitle>
        </CardHeader>
        <CardContent><Skeleton className="h-16 w-full" /></CardContent>
      </Card>
    );
  }

  const refs = data ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Hash className="h-4 w-4 text-[#555555]" />
          Reference numbers
          {refs.length ? (
            <span className="text-xs font-normal text-[#555555]">({refs.length} on file)</span>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {refs.length === 0 ? (
          <p className="text-sm text-[#555555]">
            No reference numbers are on file for this load. A baseline can be filed from a
            rate confirmation on the revision review screen.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {refs.map(r => {
              const spec = REFERENCE_CLASSES[r.reference_class as ReferenceClass];
              const unrecognized = spec?.unrecognized;
              return (
                <li key={r.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 py-2">
                  <Badge
                    variant="outline"
                    className={unrecognized
                      ? 'border-amber-300 bg-amber-50 text-amber-900'
                      : 'border-border bg-[#F9F9F9] text-[#2C2C2C]'}
                  >
                    {unrecognized ? <HelpCircle className="mr-1 h-3 w-3" /> : null}
                    {spec?.label ?? r.reference_class}
                  </Badge>
                  <span className="font-mono text-sm text-[#1A1A1A]">{r.value}</span>
                  <span className="text-xs text-[#555555]">
                    printed as “{r.label}”
                    {r.citations.length
                      ? ` · cited at ${r.citations.map(c => `stop ${c.stopSequence}`).join(', ')}`
                      : ' · load-level'}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
