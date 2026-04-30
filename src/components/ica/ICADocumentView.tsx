import { useRef, useEffect } from 'react';
import SignatureCanvas from 'react-signature-canvas';

interface ICAData {
  truck_year: string;
  truck_make: string;
  truck_vin: string;
  truck_plate: string;
  truck_plate_state: string;
  trailer_number: string;
  owner_name: string;
  owner_business_name: string;
  owner_ein: string;
  owner_ssn: string;
  owner_address: string;
  owner_city: string;
  owner_state: string;
  owner_zip: string;
  owner_phone: string;
  owner_email: string;
  linehaul_split_pct: number;
  lease_effective_date: string;
  lease_termination_date: string;
}

interface ICADocumentViewProps {
  data: ICAData;
  operatorName: string;
  previewMode?: boolean;
  carrierSignatureUrl?: string | null;
  carrierTypedName?: string;
  carrierTitle?: string;
  carrierSignedAt?: string | null;
  contractorSignatureUrl?: string | null;
  contractorTypedName?: string;
  contractorSignedAt?: string | null;
  // For operator live signing
  contractorSigRef?: React.RefObject<SignatureCanvas>;
  contractorSignedName?: string;
  onContractorSignedNameChange?: (v: string) => void;
  onSignatureEnd?: () => void;
  onSignatureClear?: () => void;
  // Deposit election
  depositElected?: boolean;
  depositInitials?: string;
  depositElectedDate?: string;
  onDepositChange?: (values: { elected?: boolean; initials?: string; date?: string }) => void;
}

const fmt = (v: string | null | undefined) => v || '___________________________';
const fmtDate = (v: string | null | undefined) => v ? new Date(v).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '___________________________';

export default function ICADocumentView({
  data, operatorName, previewMode = false,
  carrierSignatureUrl, carrierTypedName, carrierTitle, carrierSignedAt,
  contractorSignatureUrl, contractorTypedName, contractorSignedAt,
  contractorSigRef, contractorSignedName, onContractorSignedNameChange,
  onSignatureEnd, onSignatureClear,
  depositElected, depositInitials, depositElectedDate, onDepositChange
}: ICADocumentViewProps) {

  const fullTruck = [data.truck_year, data.truck_make].filter(Boolean).join(' ');
  const ownerAddr = [data.owner_city, data.owner_state, data.owner_zip].filter(Boolean).join(', ');

  // Combined contractor label: "Owner Name d/b/a Business Name"
  const contractorLabel =
    data.owner_name && data.owner_business_name
      ? `${data.owner_name} d/b/a ${data.owner_business_name}`
      : data.owner_business_name || data.owner_name || operatorName || fmt(null);

  // DPR-aware signature canvas: size once on mount only (no ResizeObserver)
  // Setting canvas.width clears drawing per HTML5 spec, so we must NOT re-run on resize
  const sigWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!contractorSigRef?.current || !sigWrapRef.current) return;
    const canvas = contractorSigRef.current.getCanvas();
    const dpr = window.devicePixelRatio || 1;
    const w = sigWrapRef.current.offsetWidth;
    const h = Math.round(w * 0.28);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.scale(dpr, dpr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractorSigRef]);

  return (
    <div className="bg-white text-foreground text-sm font-serif leading-relaxed rounded-xl border border-border overflow-hidden">
      {/* Document header */}
      <div className="bg-surface-dark text-white text-center py-6 px-4">
        <p className="text-xs tracking-[0.3em] uppercase text-gold mb-1">SUPERTRANSPORT</p>
        <p className="text-[10px] tracking-widest text-surface-dark-muted mb-4">POSITIVE. THINKING. TRANSPORT.</p>
        <h1 className="text-xl sm:text-2xl font-bold">Independent Contractor Agreement</h1>
        <p className="text-xs sm:text-sm text-surface-dark-muted mt-1">SUPERTRANSPORT, LLC · PO Box 4, Pleasant Hill, Missouri 64080</p>
      </div>

      <div className="p-4 sm:p-8 space-y-8">
        {/* Parties */}
        <section>
          <p className="text-base">
            This Agreement is entered into by and between <strong>SUPERTRANSPORT, LLC</strong> ("Carrier") and{' '}
            <strong className="underline underline-offset-2">{contractorLabel}</strong> ("Contractor").
          </p>
          <p className="mt-3 text-muted-foreground text-xs leading-relaxed">
            Carrier is a for-hire motor carrier subject to Federal Motor Carrier Safety Administration (FMCSA) regulations. Contractor is an independent business entity owning or leasing the equipment described in Appendix A and desires to lease said equipment with driver(s) to Carrier for the transportation of freight under Carrier's operating authority.
          </p>
        </section>

        <Divider />

        {/* Sections 1–13 */}
        <ClauseSection num="1" title="Independent Contractor Relationship">
          Contractor is an independent contractor and not an employee, agent, or partner of Carrier. Contractor shall be responsible for all taxes, insurance, workers' compensation (or occupational accident), and employment obligations related to its business. Nothing in this Agreement shall create an employer-employee relationship. Carrier's control is limited solely to that required by FMCSA regulations to ensure public safety and compliance.
        </ClauseSection>

        <ClauseSection num="2" title="Equipment Lease & Possession">
          Contractor leases to Carrier the equipment listed in Appendix A for use under Carrier's authority per 49 C.F.R. § 376. Carrier shall have exclusive possession and control during the term of this lease for regulatory purposes only. Contractor retains full control over operations, drivers, and business methods. The lease shall remain in effect month-to-month until terminated as provided herein.
        </ClauseSection>

        <ClauseSection num="3" title="Compensation & Settlement">
          Carrier shall pay Contractor <strong>{data.linehaul_split_pct}%</strong> of adjusted gross linehaul revenue, less deductions and agreed expenses (Appendix B). Payment will be made within 15 days after Carrier's receipt of all required delivery documents. Missing or incomplete documents may incur a $50 administrative deduction.
          <br /><br />
          Each settlement will include a detailed statement showing gross revenue, deductions, and net pay. Contractor has 30 days to dispute any settlement item; undisputed amounts thereafter are deemed final. Upon termination, final settlement shall occur within 45 days after all documents are received and equipment returned.
        </ClauseSection>

        <ClauseSection num="3A" title="Documentation Requirements">
          <ol className="list-decimal list-inside space-y-1 text-xs text-muted-foreground">
            <li>Required Documents: Contractor must obtain, complete, and submit all shipping documentation, including BOLs, PODs, lumper receipts, scale tickets, and any other documents required by Carrier, customer, or factoring company.</li>
            <li>Submission Timeline: All documentation must be uploaded or delivered within 24 hours of delivery or before the next dispatch, whichever occurs first.</li>
            <li>Accuracy & Completion: Incomplete, missing, or unsigned documents will be deemed non-compliant and may delay settlement.</li>
            <li>Carrier Assistance: Carrier may assist in retrieving missing documents; however, administrative or third-party retrieval costs may be deducted from Contractor's settlement.</li>
            <li>Acknowledgment: Contractor acknowledges that accurate and timely documentation is a condition precedent to payment.</li>
          </ol>
        </ClauseSection>

        <ClauseSection num="4" title="Repair and Maintenance Deposit">
          <p>Contractor may voluntarily elect to establish a Repair and Maintenance Deposit at the commencement of this Agreement by completing the Repair and Maintenance Deposit Election below, or at any time thereafter by providing written notice to Carrier. Regardless of whether Contractor has made a voluntary election, a Repair and Maintenance Deposit shall be required upon Contractor's first request for an advance from Carrier for repairs, maintenance, or any other purpose. Once established — whether voluntarily or upon an advance request — the deposit requirement shall remain in effect for the duration of the Agreement.</p>
          <p className="mt-3">The Repair and Maintenance Deposit shall be $2,000 per power unit, funded through automatic deductions of $200 per weekly settlement, beginning with the first settlement following either Contractor's written election or the advance request, as applicable, and continuing until the full $2,000 deposit has been accumulated.</p>
          <p className="mt-3">When Contractor's equipment requires repairs, Carrier shall pay the repair facility directly from this deposit upon receipt of a valid invoice from the repair facility. Any amounts paid from the deposit on Contractor's behalf shall be replenished through subsequent weekly settlement deductions until the full $2,000 balance is restored.</p>
          <p className="mt-3">The Repair and Maintenance Deposit is not an escrow account and shall not accrue interest.</p>
          <p className="mt-3"><strong>Termination Withhold.</strong> Upon termination or expiration of this Agreement, Carrier shall withhold $600.00 from the Repair and Maintenance Deposit balance — or from Contractor's final settlement if the deposit balance is insufficient — until all of the following conditions have been satisfied:</p>
          <ol className="list-[lower-alpha] pl-6 mt-2 space-y-1">
            <li>All Carrier-issued equipment, including but not limited to ELD devices, license plates, transponders, and any other Carrier property, has been physically returned to Carrier in acceptable condition; and</li>
            <li>Contractor has provided photographic evidence satisfactory to Carrier that SUPERTRANSPORT's name, address, and USDOT number have been removed from all power units and trailers previously operating under this Agreement.</li>
          </ol>
          <p className="mt-3">Upon satisfaction of both conditions, the withheld $600.00 shall be released to Contractor within 15 business days. If Contractor fails to satisfy both conditions within 30 days of termination, Carrier reserves the right to apply the withheld funds toward the cost of retrieving equipment or arranging for the removal of Carrier identification, and to pursue any remaining balance through available legal remedies.</p>
          <p className="mt-3">Any unused portion of the Repair and Maintenance Deposit, after application of the termination withhold and any outstanding obligations, shall be refunded to Contractor within 45 days following the termination or expiration of this Agreement, provided all conditions described herein have been satisfied.</p>
          <div className="mt-6 border border-border rounded p-4">
            <p className="font-bold mb-3">Repair and Maintenance Deposit Election</p>
            {onDepositChange ? (
              <>
                <label className="flex items-start gap-2 mb-4 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!depositElected}
                    onChange={(e) => onDepositChange({ elected: e.target.checked })}
                    className="mt-0.5 h-4 w-4 rounded border-primary accent-primary"
                  />
                  <span className="text-xs leading-relaxed">I voluntarily elect to establish a Repair and Maintenance Deposit effective upon commencement of this Agreement. I authorize Carrier to deduct $200 per weekly settlement until the full $2,000 deposit has been accumulated.</span>
                </label>
                <div className="flex flex-wrap items-center gap-4 text-xs">
                  <label className="flex items-center gap-2">
                    Contractor Initials:
                    <input
                      type="text"
                      value={depositInitials ?? ''}
                      onChange={(e) => onDepositChange({ initials: e.target.value })}
                      maxLength={5}
                      className="w-20 border-b border-border bg-transparent text-center font-medium focus:outline-none focus:border-gold"
                      placeholder="______"
                    />
                  </label>
                  <label className="flex items-center gap-2">
                    Date:
                    <input
                      type="date"
                      value={depositElectedDate ?? ''}
                      onChange={(e) => onDepositChange({ date: e.target.value })}
                      className="border-b border-border bg-transparent text-center font-medium focus:outline-none focus:border-gold"
                    />
                  </label>
                </div>
              </>
            ) : (
              <>
                <p className="mb-4">{depositElected ? '☑' : '☐'} I voluntarily elect to establish a Repair and Maintenance Deposit effective upon commencement of this Agreement. I authorize Carrier to deduct $200 per weekly settlement until the full $2,000 deposit has been accumulated.</p>
                <p>Contractor Initials: {depositInitials || '________'} &nbsp;&nbsp;&nbsp; Date: {depositElectedDate || '________'}</p>
              </>
            )}
          </div>
        </ClauseSection>

        <ClauseSection num="5" title="Insurance & Liability">
          Carrier maintains public liability and cargo insurance per federal requirements. Contractor shall maintain: Occupational Accident or Workers' Compensation ($1 million minimum); Non-Trucking Liability ($1 million minimum); Physical Damage (optional via Carrier). Contractor is responsible for the first $2,000 of any cargo or accident claim caused by its negligence.
        </ClauseSection>

        <ClauseSection num="6" title="Contractor Responsibilities">
          Contractor is solely responsible for: fuel, permits, tolls, taxes, and maintenance; hiring, training, and paying drivers; DOT, FMCSA, and IFTA compliance; safe operation and load securement; immediate reporting of accidents, fines, or out-of-service events. Contractor indemnifies and holds Carrier harmless from all claims or penalties arising from its operations.
        </ClauseSection>

        <ClauseSection num="6A" title="Passenger Policy">
          Contractor and its drivers may not transport passengers while operating under this Agreement without prior written authorization from Carrier per 49 C.F.R. § 392.60. Authorized passengers must execute a Passenger Authorization and Liability Waiver before any trip. Contractor assumes all risk for any injury or loss involving unauthorized passengers.
        </ClauseSection>

        <ClauseSection num="7" title="Operational Independence">
          Contractor may accept or reject load offers from Carrier and is free to determine its own methods, routes, and schedules consistent with federal and state safety regulations. While the leased equipment is under the authority and control of SUPERTRANSPORT, LLC, Contractor shall not haul freight for any other carrier unless prior written authorization is granted by Carrier.
        </ClauseSection>

        <ClauseSection num="8" title="Right of Set-Off">
          Carrier may deduct or offset from any settlement amounts owed to Contractor any unpaid obligations, advances, fines, or unreturned equipment.
        </ClauseSection>

        <ClauseSection num="9" title="Confidentiality & Non-Solicitation">
          Contractor shall not disclose Carrier's rates, customers, or data, nor solicit freight or transport loads for any customer introduced by Carrier for one year after termination.
        </ClauseSection>

        <ClauseSection num="10" title="Termination">
          Either party may terminate upon 15 days' written notice. Carrier may terminate immediately for safety violations, fraud, or disqualification. Contractor has five business days to cure minor breaches. Upon termination, Contractor must promptly return all Carrier property and identification.
        </ClauseSection>

        <ClauseSection num="11" title="Electronic Communication & Signatures">
          All notices, approvals, and settlements may be electronic. Electronic signatures are legally binding.
        </ClauseSection>

        <ClauseSection num="12" title="Dispute Resolution">
          Disputes shall be resolved by binding arbitration under AAA Commercial Rules in Cass County, Missouri, governed by Missouri law.
        </ClauseSection>

        <ClauseSection num="13" title="Entire Agreement">
          This Agreement, including Appendices A–D and exhibits, constitutes the full understanding between the parties and may only be modified in writing signed by both. May be executed in counterparts.
          <br /><br />
          <em className="text-xs text-muted-foreground">Note: Separate signatures are not required for Appendices A–D except where indicated for equipment transfers or optional insurance acknowledgments. All appendices are incorporated by reference and enforceable as part of this Agreement.</em>
        </ClauseSection>

        <Divider />

        {/* Signature Page */}
        <section>
          <h2 className="text-base font-bold text-foreground mb-6 uppercase tracking-wide">Signature Page</h2>
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

            {/* Contractor */}
            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground border-b border-border pb-1">Contractor</p>
              <p className="font-semibold">{contractorLabel}</p>
              {contractorSigRef && !previewMode ? (
                <div className="space-y-2">
                  <div ref={sigWrapRef} className="border-2 border-dashed border-gold/40 rounded-lg overflow-hidden bg-white">
                    <SignatureCanvas
                      ref={contractorSigRef}
                      canvasProps={{ className: 'w-full touch-none' }}
                      penColor="#1a1a1a"
                      onEnd={() => onSignatureEnd?.()}
                    />
                  </div>
                  <button
                    onClick={() => { contractorSigRef.current?.clear(); onSignatureClear?.(); }}
                    className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Clear signature
                  </button>
                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">Typed Full Name</p>
                    <input
                      value={contractorSignedName ?? ''}
                      onChange={e => onContractorSignedNameChange?.(e.target.value)}
                      className="w-full border-b border-foreground/30 bg-transparent text-sm outline-none py-1"
                      placeholder="Type your full name"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Date: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                </div>
              ) : contractorSignatureUrl ? (
                <div className="border border-border rounded-lg p-2 bg-secondary/20">
                  <img src={contractorSignatureUrl} alt="Contractor signature" className="h-16 w-auto" />
                </div>
              ) : (
                <div className="border-b border-foreground/30 h-16 flex items-end pb-1">
                  <span className="text-xs text-muted-foreground">Signature</span>
                </div>
              )}
              <SigLine label="Name" value={contractorTypedName || contractorSignedName} />
              <SigLine label="Date" value={contractorSignedAt ? fmtDate(contractorSignedAt) : undefined} />
            </div>
          </div>
        </section>

        <Divider />

        {/* Appendix A */}
        <section>
          <AppendixHeader letter="A" title="Equipment Identification" />
          <table className="w-full text-sm border-collapse mt-4">
            <tbody>
              <AppRow label="Year / Make / Model" value={fullTruck || fmt(null)} />
              <AppRow label="VIN" value={fmt(data.truck_vin)} />
              <AppRow label="License Plate & State" value={[data.truck_plate, data.truck_plate_state].filter(Boolean).join(' / ') || fmt(null)} />
              <AppRow label="Trailer Number / VIN (if leased)" value={fmt(data.trailer_number)} />
              <AppRow label="Owner Name" value={fmt(data.owner_name)} />
              <AppRow label="Business Name" value={fmt(data.owner_business_name)} />
              {data.owner_ein && <AppRow label="EIN" value={fmt(data.owner_ein)} />}
              {data.owner_ssn && <AppRow label="SSN" value={fmt(data.owner_ssn)} />}
              <AppRow label="Address" value={fmt(data.owner_address)} />
              <AppRow label="City / State / ZIP" value={ownerAddr || fmt(null)} />
              <AppRow label="Phone / Email" value={[data.owner_phone, data.owner_email].filter(Boolean).join(' / ') || fmt(null)} />
            </tbody>
          </table>
        </section>

        <Divider />

        {/* Appendix B */}
        <section>
          <AppendixHeader letter="B" title="Compensation & Deductions" />
          <table className="w-full text-sm border-collapse mt-4">
            <tbody>
              <AppRow label="Linehaul Split" value={`Contractor receives ${data.linehaul_split_pct}% of adjusted gross linehaul revenue.`} highlight />
              <AppRow label="Settlement" value="Weekly, within 15 days after all required paperwork." />
              <AppRow label="Deductions" value="Fuel, maintenance, trailer rental, permits, tolls, and operating expenses itemized per settlement." />
              <AppRow label="Disputes" value="Contractor has 30 days from receipt to dispute any settlement." />
              <AppRow label="Final Settlement" value="Within 45 days after termination and return of equipment." />
            </tbody>
          </table>
        </section>

        <Divider />

        {/* Appendix C — Condition and Comments removed per user request */}
        <section>
          <AppendixHeader letter="C" title="Equipment Receipt & Return" />
          <table className="w-full text-sm border-collapse mt-4">
            <tbody>
              <AppRow label="Equipment (Year / Make / VIN)" value={[fullTruck, data.truck_vin].filter(Boolean).join(' · ') || fmt(null)} />
              <AppRow label="Lease Effective Date" value={fmtDate(data.lease_effective_date)} />
              <AppRow label="Lease Termination Date" value={data.lease_termination_date ? fmtDate(data.lease_termination_date) : fmt(null)} />
              <AppRow label="Carrier Representative" value={fmt(carrierTypedName)} />
              <AppRow label="Contractor" value={fmt(contractorTypedName || contractorSignedName)} />
              <AppRow label="Date" value={fmtDate(data.lease_effective_date)} />
            </tbody>
          </table>
        </section>

        <Divider />

        {/* Appendix D */}
        <section>
          <AppendixHeader letter="D" title="Insurance & Startup Acknowledgment" />
          {/* Appendix D table — stacks on mobile to avoid 3-col overflow */}
          <div className="mt-4 space-y-2">
            {/* Header row — hidden on mobile */}
            <div className="hidden sm:grid sm:grid-cols-3 bg-secondary/50 rounded-t border border-border">
              <span className="p-2 text-xs font-semibold border-r border-border">Category</span>
              <span className="p-2 text-xs font-semibold border-r border-border">Description</span>
              <span className="p-2 text-xs font-semibold">Responsibility</span>
            </div>
            {[
              ['Required Insurance', 'Occupational Accident, Non-Trucking Liability', 'Contractor'],
              ['Optional Insurance', 'Physical Damage via Carrier (if elected)', 'Contractor'],
              ['Compliance Fees', 'Registration, Plates, 2290, setup costs', 'Contractor'],
              ['Equipment or Trailer Lease', 'Weekly deduction if applicable', 'Contractor'],
              ['Other Authorized Deductions', 'BestPass', 'Contractor'],
            ].map(([cat, desc, resp]) => (
              <div key={cat} className="border border-border rounded sm:rounded-none sm:border-t-0 sm:grid sm:grid-cols-3 text-xs">
                {/* Mobile: stacked card; Desktop: row */}
                <div className="p-2 font-medium sm:border-r sm:border-border">{cat}</div>
                <div className="p-2 text-muted-foreground sm:border-r sm:border-border border-t border-border sm:border-t-0">{desc}</div>
                <div className="p-2 border-t border-border sm:border-t-0">{resp}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function Divider() {
  return <hr className="border-border" />;
}

function ClauseSection({ num, title, children }: { num: string; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-sm font-bold text-foreground mb-2">{num}. {title}</h3>
      <div className="text-xs text-muted-foreground leading-relaxed">{children}</div>
    </section>
  );
}

function AppendixHeader({ letter, title }: { letter: string; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-8 h-8 rounded-full bg-gold/15 text-gold text-sm font-bold flex items-center justify-center border border-gold/30">{letter}</span>
      <h2 className="text-base font-bold text-foreground">Appendix {letter} – {title}</h2>
    </div>
  );
}

function AppRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <tr className="border-b border-border">
      <td className="py-2 pr-2 font-medium text-xs text-muted-foreground w-[35%] min-w-[90px] border border-border px-2 sm:px-3 align-top">{label}</td>
      <td className={`py-2 text-xs border border-border px-2 sm:px-3 break-words ${highlight ? 'font-bold text-gold' : 'text-foreground'}`}>{value}</td>
    </tr>
  );
}

function SigLine({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-baseline gap-2 text-xs">
      <span className="text-muted-foreground w-10 shrink-0">{label}:</span>
      <span className={`border-b border-foreground/30 flex-1 min-h-[1.25rem] ${value ? 'text-foreground font-medium' : 'text-muted-foreground/40'}`}>
        {value || ''}
      </span>
    </div>
  );
}
