/**
 * Shown in place of a printed disclosure when the carrier's identity could not
 * be read.
 *
 * A federal authorization form carries the company's legal name, locality, USDOT
 * and MC. Printing it without them — or worse, with some other carrier's — is
 * the defect this replaces. The document is withheld and the reason stated.
 */
export default function CarrierIdentityUnavailable({ docLabel }: { docLabel: string }) {
  return (
    <div
      className="font-serif text-[13px] leading-relaxed text-black bg-white"
      style={{ padding: '1in', maxWidth: '8.5in', fontFamily: 'Times New Roman, serif' }}
      data-testid="carrier-identity-unavailable"
    >
      <p style={{ fontWeight: 'bold', marginBottom: '10px' }}>{docLabel} is not available right now.</p>
      <p>
        We could not load the carrier details that belong at the top of this form, so it has not been
        printed. Please try again in a moment. If it keeps happening, tell the recruiting team — the
        form must never go out without the company's legal name, location, USDOT and MC number.
      </p>
    </div>
  );
}
