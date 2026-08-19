import { useQuery } from '@tanstack/react-query';
import { fetchFacilities, type Facility } from '@/lib/facilities';

export const FACILITIES_QUERY_KEY = ['facilities', 'active'] as const;

/** Active facilities, most-used first. Shared by the stop picker and list page. */
export function useFacilities() {
  return useQuery<Facility[]>({
    queryKey: FACILITIES_QUERY_KEY,
    queryFn: () => fetchFacilities(true),
    staleTime: 60_000,
  });
}
