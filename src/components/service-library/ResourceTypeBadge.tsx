import { Badge } from '@/components/ui/badge';
import { RESOURCE_TYPE_COLORS, type ResourceType } from './ServiceLibraryTypes';

export default function ResourceTypeBadge({ type }: { type: ResourceType }) {
  return (
    <Badge className={`text-xs border font-medium ${RESOURCE_TYPE_COLORS[type]}`}>
      {type}
    </Badge>
  );
}
