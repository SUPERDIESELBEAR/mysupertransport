import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, AlertTriangle, Download, ScrollText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import ICADocumentView from '@/components/ica/ICADocumentView';
import { BLANK_ICA_DATA } from '@/lib/ica/blankIcaData';
import { downloadIcaPdf } from '@/lib/ica/generateIcaPdf';
import { toast } from 'sonner';

interface LinkInfo {
  valid: boolean;
  recipient_name?: string;
  note?: string | null;
  expires_at?: string;
}

export default function IcaReview() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<LinkInfo | null>(null);
  const [downloading, setDownloading] = useState(false);
  const docRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    (async () => {
      const { data, error } = await supabase.rpc('get_ica_review_link', { _token: token });
      if (error) {
        setInfo({ valid: false });
      } else {
        setInfo(data as unknown as LinkInfo);
      }
      setLoading(false);
    })();
  }, [token]);

  async function handleDownload() {
    if (!docRef.current) return;
    setDownloading(true);
    try {
      await downloadIcaPdf(docRef.current, 'SUPERTRANSPORT-ICA-Review-Copy.pdf');
    } catch {
      toast.error('Could not generate the PDF. Please try again.');
    } finally {
      setDownloading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  if (!info?.valid) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-6 bg-muted/30">
        <Card className="max-w-md p-8 text-center space-y-3">
          <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto" />
          <h1 className="text-lg font-semibold">Review Link Unavailable</h1>
          <p className="text-sm text-muted-foreground">
            This review link is invalid, has expired, or was revoked. Please contact
            your SUPERTRANSPORT recruiting contact for a new link.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-muted/30">
      <header className="sticky top-0 z-30 bg-surface-dark text-white border-b border-white/10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] tracking-[0.3em] uppercase text-gold">SUPERTRANSPORT</p>
            <h1 className="text-sm font-semibold truncate flex items-center gap-2">
              <ScrollText className="h-4 w-4 shrink-0" />
              Independent Contractor Agreement — Review Copy
            </h1>
          </div>
          <Button size="sm" onClick={handleDownload} disabled={downloading} className="gap-2 shrink-0">
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Download PDF
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        <Card className="p-4 text-sm">
          <p className="font-medium">
            {info.recipient_name ? `Hi ${info.recipient_name} — ` : ''}
            this is a review copy only.
          </p>
          <p className="text-muted-foreground mt-1">
            No signature is collected on this page. Your final agreement is prepared
            with your own equipment, pay, and business details during onboarding.
          </p>
          {info.note ? (
            <p className="mt-3 rounded-md bg-gold/10 border border-gold/30 p-3 text-foreground">{info.note}</p>
          ) : null}
        </Card>

        <div ref={docRef}>
          <ICADocumentView
            data={BLANK_ICA_DATA}
            operatorName=""
            previewMode
            watermark
          />
        </div>
      </main>
    </div>
  );
}