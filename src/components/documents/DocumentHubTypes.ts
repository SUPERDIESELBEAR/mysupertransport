export type DocCategory = 'Onboarding' | 'Safety' | 'Compliance' | 'HR & Pay' | 'General';

export interface DriverDocument {
  id: string;
  title: string;
  description: string | null;
  body: string | null;
  category: DocCategory;
  is_visible: boolean;
  is_required: boolean;
  is_pinned: boolean;
  sort_order: number;
  estimated_read_minutes: number | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface DocumentAcknowledgment {
  id: string;
  document_id: string;
  user_id: string;
  acknowledged_at: string;
  document_version: number;
}

export const CATEGORIES: DocCategory[] = ['Onboarding', 'Safety', 'Compliance', 'HR & Pay', 'General'];

export const CATEGORY_COLORS: Record<DocCategory, string> = {
  Onboarding: 'bg-gold/15 text-gold-muted border-gold/30',
  Safety:     'bg-destructive/10 text-destructive border-destructive/30',
  Compliance: 'bg-info/10 text-info border-info/30',
  'HR & Pay': 'bg-status-complete/10 text-status-complete border-status-complete/30',
  General:    'bg-muted text-muted-foreground border-border',
};
