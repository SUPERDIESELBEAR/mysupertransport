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
  // Content type fields
  content_type: 'rich_text' | 'pdf' | 'video';
  pdf_url: string | null;
  pdf_path: string | null;
  video_url: string | null;
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

/** Parse a YouTube or Vimeo share/watch URL into an embeddable iframe src. Returns null if not recognized. */
export function parseVideoEmbedUrl(url: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();

  // YouTube: youtu.be/ID or youtube.com/watch?v=ID or youtube.com/embed/ID
  const ytShort = trimmed.match(/^https?:\/\/(?:www\.)?youtu\.be\/([A-Za-z0-9_-]{11})/);
  if (ytShort) return `https://www.youtube.com/embed/${ytShort[1]}`;

  const ytWatch = trimmed.match(/^https?:\/\/(?:www\.)?youtube\.com\/watch\?(?:.*&)?v=([A-Za-z0-9_-]{11})/);
  if (ytWatch) return `https://www.youtube.com/embed/${ytWatch[1]}`;

  const ytEmbed = trimmed.match(/^https?:\/\/(?:www\.)?youtube\.com\/embed\/([A-Za-z0-9_-]{11})/);
  if (ytEmbed) return `https://www.youtube.com/embed/${ytEmbed[1]}`;

  // Vimeo: vimeo.com/ID or player.vimeo.com/video/ID
  const vimeo = trimmed.match(/^https?:\/\/(?:www\.)?vimeo\.com\/(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;

  const vimeoEmbed = trimmed.match(/^https?:\/\/player\.vimeo\.com\/video\/(\d+)/);
  if (vimeoEmbed) return `https://player.vimeo.com/video/${vimeoEmbed[1]}`;

  return null;
}
