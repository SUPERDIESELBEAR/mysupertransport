interface LeaseTerminationDocumentViewProps {
  contractorLabel: string;
  truckYear?: string | null;
  truckMake?: string | null;
  truckModel?: string | null;
  truckVin?: string | null;
  truckPlate?: string | null;
  truckPlateState?: string | null;
  trailerNumber?: string | null;
  effectiveDate: string; // YYYY-MM-DD
  leaseEffectiveDate?: string | null; // YYYY-MM-DD
  carrierSignatureUrl?: string | null;
  carrierTypedName?: string | null;
  carrierTitle?: string | null;
  carrierSignedAt?: string | null;
  contractorSignatureUrl?: string | null;
  contractorTypedName?: string | null;
  contractorSignedAt?: string | null;
}

const fmtDate = (v: string | null | undefined) => {
  if (!v) return '___________________________';
  // Anchor at noon to prevent timezone shift
  const dateStr = v.length === 10 ? `${v}T12:00:00` : v;
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
};

export default function LeaseTerminationDocumentView({
  contractorLabel,
  truckYear, truckMake, truckModel, truckVin, truckPlate, truckPlateState, trailerNumber,
  effectiveDate, leaseEffectiveDate,
  carrierSignatureUrl, carrierTypedName, carrierTitle, carrierSignedAt,
  contractorSignatureUrl, contractorTypedName, contractorSignedAt,
}: LeaseTerminationDocumentViewProps) {
  const fullTruck = [truckYear, truckMake, truckModel].filter(Boolean).join(' ') || '—';

  return (
    <div className="bg-white text-foreground text-sm font-serif leading-relaxed rounded-xl border border-border overflow-hidden">
      {/* Header */}
      <div className="bg-surface-dark text-white text-center py-6 px-4">
        <p className="text-xs tracking-[0.3em] uppercase text-gold mb-1">SUPERTRANSPORT</p>
        <p className="text-[10px] tracking-widest text-surface-dark-muted mb-4">POSITIVE. THINKING. TRANSPORT.</p>
        <h1 className="text-xl sm:text-2xl font-bold">Appendix C — Lease Termination</h1>
        <p className="text-xs sm:text-sm text-surface-dark-muted mt-1">
          SUPERTRANSPORT, LLC · PO Box 4, Pleasant Hill, Missouri 64080
        </p>
      </div>

      <div className="p-4 sm:p-8 space-y-8">
        {/* Notice body */}
        <section>
          <p className="text-base">
            Pursuant to <strong>Section 10 (Termination)</strong> of the Independent Contractor Agreement dated{' '}
            <strong className="underline underline-offset-2">{fmtDate(leaseEffectiveDate)}</strong> between{' '}
            <strong>SUPERTRANSPORT, LLC</strong> ("Carrier") and{' '}
            <strong className="underline underline-offset-2">{contractorLabel}</strong> ("Contractor"),
            Carrier hereby provides notice that the equipment lease for the unit described below is terminated effective{' '}
            <strong className="underline underline-offset-2">{fmtDate(effectiveDate)}</strong>.
          </p>
          <p className="mt-4 text-muted-foreground text-xs leading-relaxed">
            All rights, duties, and obligations under the Agreement and Appendix A cease as of that date, except those
            that survive by their terms (Sections 8 Set-Off, 9 Confidentiality &amp; Non-Solicitation, and 12 Dispute
            Resolution). Contractor shall promptly return all Carrier property, decals, fuel cards, ELD devices, and any
            other identifying equipment, and shall remain liable for any obligations accrued through the effective date
            of termination.
          </p>
        </section>

        <Divider />

        {/* Equipment block */}
        <section>
          <h2 className="text-base font-bold text-foreground mb-4 uppercase tracking-wide">Equipment Described</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <Field label="Year / Make / Model" value={fullTruck} />
            <Field label="VIN" value={truckVin} mono />
            <Field label="License Plate" value={[truckPlate, truckPlateState].filter(Boolean).join(' · ') || '—'} />
            <Field label="Trailer Number" value={trailerNumber} />
          </div>
        </section>

        <Divider />

        {/* Signature page */}
        <section>
          <h2 className="text-base font-bold text-foreground mb-6 uppercase tracking-wide">Signature</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
            {/* Carrier */}
            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground border-b border-border pb-1">Carrier</p>
              <p className="font-semibold">SUPERTRANSPORT, LLC</p>
              <p className="text-xs text-muted-foreground">PO Box 4, Pleasant Hill, MO 64080</p>
              {carrierSignatureUrl ? (
                <div className="border border-border rounded-lg p-2 bg-secondary/20">
                  <img src={carrierSignatureUrl} alt="Carrier signature" className="h-16 w-auto" />
                </div>
              ) : (
                <div className="border-b border-foreground/30 h-16 flex items-end pb-1">
                  <span className="text-xs text-muted-foreground">Signature</span>
                </div>
              )}
              <SigLine label="Name" value={carrierTypedName} />
              <SigLine label="Title" value={carrierTitle} />
              <SigLine label="Date" value={carrierSignedAt ? fmtDate(carrierSignedAt) : undefined} />
            </div>

            {/* Contractor (carrier-only mode by default — placeholder for future countersign) */}
            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground border-b border-border pb-1">Contractor Acknowledgment</p>
              <p className="font-semibold">{contractorLabel}</p>
              {contractorSignatureUrl ? (
                <div className="border border-border rounded-lg p-2 bg-secondary/20">
                  <img src={contractorSignatureUrl} alt="Contractor signature" className="h-16 w-auto" />
                </div>
              ) : (
                <div className="border-b border-foreground/30 h-16 flex items-end pb-1">
                  <span className="text-xs text-muted-foreground">Signature (optional)</span>
                </div>
              )}
              <SigLine label="Name" value={contractorTypedName} />
              <SigLine label="Date" value={contractorSignedAt ? fmtDate(contractorSignedAt) : undefined} />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Divider() {
  return <div className="border-t border-border" />;
}

function Field({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{label}</p>
      <p className={`mt-0.5 ${mono ? 'font-mono' : 'font-medium'}`}>{value || '—'}</p>
    </div>
  );
}

function SigLine({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="border-b border-foreground/30 pb-1">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}: </span>
      <span className="text-sm">{value || '___________________________'}</span>
    </div>
  );
}