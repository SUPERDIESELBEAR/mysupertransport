import { useQuery } from '@tanstack/react-query';
import { fetchBrokers, type Broker } from '@/lib/brokers';

export const BROKERS_QUERY_KEY = ['brokers', 'directory'] as const;

/** Broker directory with load counts. Shared by the list page. */
export function useBrokers() {
  return useQuery<Broker[]>({
    queryKey: BROKERS_QUERY_KEY,
    queryFn: fetchBrokers,
    staleTime: 60_000,
  });
}
