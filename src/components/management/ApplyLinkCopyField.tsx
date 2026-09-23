import { useEffect, useState } from 'react';
import { Check, Copy, Link2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

/**
 * The carrier's own driver-application link, ready to copy.
 *
 * The slug comes from `carrier_profile.apply_slug` under RLS, so a staff member
 * only ever sees their own carrier's link. An applicant who opens it signs
 * disclosures carrying THIS carrier's legal name, locality, USDOT and MC.
 */
export default function ApplyLinkCopyField() {
  const [slug, setSlug] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('carrier_profile')
      .select('apply_slug')
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setSlug((data as { apply_slug?: string | null } | null)?.apply_slug ?? null);
      });
    return () => { cancelled = true; };
  }, []);

  if (!slug) return null;

  const url = `${window.location.origin}/apply/${slug}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* clipboard blocked — the link is still readable on screen */
    }
  };

  return (
    <div className="rounded-lg border border-border bg-muted/40 p-3" data-testid="apply-link-copy">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground mb-1.5">
        <Link2 className="h-3.5 w-3.5 text-gold" />
        Your company's application link
      </div>
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate rounded-md bg-background px-2 py-1.5 text-xs text-muted-foreground">
          {url}
        </code>
        <button
          type="button"
          onClick={() => { void copy(); }}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs font-semibold hover:bg-accent"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-status-complete" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
        Share it anywhere — a job board, a text message, a truck-stop flyer. Anyone who applies through
        it lands in your pipeline, on your paperwork.
      </p>
    </div>
  );
}
