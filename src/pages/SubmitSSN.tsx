import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';
import logo from '@/assets/supertransport-logo.png';

const SubmitSSN = () => {
  const [searchParams] = useSearchParams();
  const applicationId = searchParams.get('id');

  const [ssn, setSsn] = useState('');
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(true);
  const [valid, setValid] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applicantName, setApplicantName] = useState('');

  // Validate application exists
  useEffect(() => {
    if (!applicationId) {
      setValidating(false);
      setError('Invalid link — no application ID provided.');
      return;
    }
    (async () => {
      const { data, error: fetchErr } = await supabase
        .from('applications')
        .select('id, first_name, last_name, ssn_encrypted')
        .eq('id', applicationId)
        .maybeSingle();

      setValidating(false);
      if (fetchErr || !data) {
        setError('Application not found. Please check your link and try again.');
        return;
      }
      if (data.ssn_encrypted) {
        setSuccess(true); // already has SSN
        return;
      }
      setApplicantName([data.first_name, data.last_name].filter(Boolean).join(' '));
      setValid(true);
    })();
  }, [applicationId]);

  const formatSsn = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 9);
    if (digits.length <= 3) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  };

  const handleSubmit = async () => {
    const digits = ssn.replace(/\D/g, '');
    if (digits.length !== 9) return;

    setLoading(true);
    setError(null);

    try {
      // 1. Encrypt via edge function
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const encryptRes = await fetch(
        `https://${projectId}.supabase.co/functions/v1/encrypt-ssn`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${anonKey}`,
          },
          body: JSON.stringify({ ssn: digits }),
        }
      );

      if (!encryptRes.ok) throw new Error('Encryption failed');
      const { encrypted } = await encryptRes.json();

      // 2. Update the application record
      const { error: updateErr } = await supabase
        .from('applications')
        .update({ ssn_encrypted: encrypted })
        .eq('id', applicationId!);

      if (updateErr) throw updateErr;
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-dark flex flex-col">
      {/* Header */}
      <header className="bg-surface-dark border-b border-gold/20 px-6 py-4">
        <div className="max-w-md mx-auto flex items-center gap-3">
          <img src={logo} alt="SUPERTRANSPORT" className="h-8 w-auto" />
          <span className="text-gold font-extrabold tracking-widest text-lg">SUPERTRANSPORT</span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          {validating ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-gold" />
              <p className="text-sm text-surface-dark-muted">Verifying your application…</p>
            </div>
          ) : success ? (
            <div className="bg-surface-dark-card border border-gold/20 rounded-xl p-8 text-center">
              <CheckCircle2 className="h-12 w-12 text-status-success mx-auto mb-4" />
              <h1 className="text-xl font-bold text-white mb-2">SSN Received</h1>
              <p className="text-sm text-surface-dark-muted">
                Your Social Security Number has been securely saved. No further action is needed — you can close this page.
              </p>
            </div>
          ) : error && !valid ? (
            <div className="bg-surface-dark-card border border-destructive/30 rounded-xl p-8 text-center">
              <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <h1 className="text-xl font-bold text-white mb-2">Unable to Load</h1>
              <p className="text-sm text-surface-dark-muted">{error}</p>
            </div>
          ) : (
            <div className="bg-surface-dark-card border border-gold/20 rounded-xl p-8">
              <div className="flex items-center gap-2 mb-6">
                <ShieldCheck className="h-5 w-5 text-gold" />
                <h1 className="text-lg font-bold text-white">Update Your Application</h1>
              </div>

              {applicantName && (
                <p className="text-sm text-surface-dark-muted mb-4">
                  Hi <span className="text-white font-medium">{applicantName}</span>, we need one more piece of information to complete your application.
                </p>
              )}

              <p className="text-xs text-surface-dark-muted mb-6">
                Due to a minor technical issue, your Social Security Number was not captured when you submitted your application. Please enter it below — it will be encrypted and securely stored.
              </p>

              <label className="block text-xs font-semibold text-surface-dark-muted mb-2 uppercase tracking-wider">
                Social Security Number
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={ssn}
                onChange={(e) => setSsn(formatSsn(e.target.value))}
                placeholder="XXX-XX-XXXX"
                maxLength={11}
                className="w-full h-12 px-4 rounded-lg bg-surface-dark border border-gold/30 text-white font-mono text-lg tracking-[0.25em] placeholder:text-surface-dark-muted/50 focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold"
              />

              {error && (
                <p className="text-xs text-destructive mt-2">{error}</p>
              )}

              <Button
                onClick={handleSubmit}
                disabled={loading || ssn.replace(/\D/g, '').length !== 9}
                className="w-full mt-6 h-12 bg-gold hover:bg-gold-light text-surface-dark font-bold text-sm tracking-wide"
              >
                {loading ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Encrypting & Saving…</>
                ) : (
                  'Submit Securely'
                )}
              </Button>

              <p className="text-[10px] text-surface-dark-muted/60 mt-4 text-center">
                🔒 Your SSN is encrypted with AES-256 before being stored. It is never saved in plain text.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default SubmitSSN;
