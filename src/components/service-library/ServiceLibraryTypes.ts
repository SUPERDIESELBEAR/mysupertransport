export type ResourceType = 'Setup Guide' | 'Tutorial Video' | 'PDF' | 'FAQ' | 'External Link' | 'Contact & Support';
export type HelpRequestStatus = 'Open' | 'In Progress' | 'Resolved';

export interface Service {
  id: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  support_phone: string | null;
  support_email: string | null;
  support_chat_url: string | null;
  support_hours: string | null;
  known_issues_notes: string | null;
  is_visible: boolean;
  is_new_driver_essential: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  // computed
  resources?: ServiceResource[];
  completion_count?: number;
  total_start_here?: number;
}

export interface ServiceResource {
  id: string;
  service_id: string;
  title: string;
  description: string | null;
  resource_type: ResourceType;
  url: string | null;
  body: string | null;
  is_start_here: boolean;
  is_visible: boolean;
  estimated_minutes: number | null;
  last_verified_at: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  // computed
  is_completed?: boolean;
  is_bookmarked?: boolean;
  completion_count?: number;
  bookmark_count?: number;
}

export interface ServiceHelpRequest {
  id: string;
  service_id: string;
  resource_id: string | null;
  user_id: string;
  message: string | null;
  status: HelpRequestStatus;
  created_at: string;
  // joined
  service_name?: string;
  resource_title?: string | null;
  driver_name?: string;
  driver_email?: string;
}

export const RESOURCE_TYPE_COLORS: Record<ResourceType, string> = {
  'Setup Guide': 'bg-blue-500/10 text-blue-600 border-blue-500/30',
  'Tutorial Video': 'bg-red-500/10 text-red-600 border-red-500/30',
  'PDF': 'bg-orange-500/10 text-orange-600 border-orange-500/30',
  'FAQ': 'bg-purple-500/10 text-purple-600 border-purple-500/30',
  'External Link': 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
  'Contact & Support': 'bg-gold/10 text-gold-muted border-gold/30',
};

export const RESOURCE_TYPE_ICONS: Record<ResourceType, string> = {
  'Setup Guide': '📋',
  'Tutorial Video': '▶️',
  'PDF': '📄',
  'FAQ': '❓',
  'External Link': '🔗',
  'Contact & Support': '📞',
};

export const ALL_RESOURCE_TYPES: ResourceType[] = [
  'Setup Guide', 'Tutorial Video', 'PDF', 'FAQ', 'External Link', 'Contact & Support',
];
