import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, AlertTriangle, Download, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import FCRAAuthorizationDoc from '@/components/application/documents/FCRAAuthorizationDoc';
import type { FullApplication } from '@/components/management/ApplicationReviewDrawer';
import { openPrintableDocument } from '@/lib/printDocument';

interface ReleaseResponse {
  application: Partial<FullApplication> & {
    id: string;
    email: string;
    signed_date: string;
  };
  signatureDataUrl: string | null;
  pei: { employer_name: string; status: string };
}

export default function PEIRelease() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ReleaseResponse | null>(null);

  useEffect(() => {
    if (!token) {
      setError('Missing release token.');
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const { data: res, error } = await supabase.functions.invoke(
          'pei-release-fcra',
          { body: { token } },
        );
        if (error) throw error;
        if ((res as any)?.error) throw new Error((res as any).error);
        setData(res as ReleaseResponse);
      } catch (e: any) {
        setError(
          e?.message?.replace(/^Edge Function returned a non-2xx status code.*/i, '') ||
            'Could not load this signed authorization.',
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-muted/30">
        <Card className="max-w-md p-8 text-center space-y-3">
          <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto" />
          <h1 className="text-lg font-semibold">Authorization Unavailable</h1>
          <p className="text-sm text-muted-foreground">
            {error || 'This release link is invalid or has been revoked.'}
          </p>
        </Card>
      </div>
    );
  }

  const app = data.application as FullApplication;

  return (
    <div className="min-h-screen bg-muted/40 py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start gap-3">
            <ShieldCheck className="h-6 w-6 text-gold mt-0.5" />
            <div>
              <h1 className="text-xl font-semibold leading-tight">
                Signed FCRA Authorization
              </h1>
              <p className="text-sm text-muted-foreground">
                Provided to <strong>{data.pei.employer_name}</strong> for
                previous-employer verification under 49 CFR §391.23.
              </p>
            </div>
          </div>
          <Button
            onClick={() =>
              openPrintableDocument(
                'fcra-release-doc',
                `FCRA Authorization — ${[app.first_name, app.last_name].filter(Boolean).join(' ')}`,
              )
            }
            className="gap-2"
            size="lg"
          >
            <Download className="h-4 w-4" />
            Save as PDF
          </Button>
        </div>

        <Card className="overflow-hidden p-0">
          <div id="fcra-release-doc">
            <FCRAAuthorizationDoc
              app={app}
              signatureDataUrl={data.signatureDataUrl}
            />
          </div>
        </Card>

        <p className="text-xs text-muted-foreground text-center max-w-2xl mx-auto">
          This authorization was completed and signed electronically by the
          applicant during their application with SUPERTRANSPORT. Access to
          this document is logged. If you believe you received this link in
          error, please disregard.
        </p>
        <p className="text-[11px] text-muted-foreground text-center max-w-xl mx-auto">
          On mobile, tap <strong>Save as PDF</strong> and choose
          <em> Save to Files</em> (iOS) or <em>Save as PDF</em> (Android)
          from the print dialog.
        </p>
      </div>
    </div>
  );
}