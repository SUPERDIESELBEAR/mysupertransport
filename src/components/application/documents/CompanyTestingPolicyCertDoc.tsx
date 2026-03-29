import { FullApplication } from '@/components/management/ApplicationReviewDrawer';

interface Props {
  app: FullApplication;
  signatureDataUrl?: string | null;
}

export default function CompanyTestingPolicyCertDoc({ app, signatureDataUrl }: Props) {
  const fullName = [app.first_name, app.last_name].filter(Boolean).join(' ') || app.email;
  const signedDate = app.signed_date
    ? new Date(app.signed_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : '___________________';
  const dob = app.dob
    ? new Date(app.dob).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null;
  const sigSrc = signatureDataUrl || app.signature_image_url;

  return (
    <div
      className="font-serif text-[13px] leading-relaxed text-black bg-white"
      style={{ padding: '1in', maxWidth: '8.5in', minHeight: '11in', fontFamily: 'Times New Roman, serif' }}
    >
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '0.5in', borderBottom: '2px solid #000', paddingBottom: '0.2in' }}>
        <div style={{ fontSize: '20px', fontWeight: 'bold', letterSpacing: '0.1em', marginBottom: '4px' }}>
          SUPERTRANSPORT
        </div>
        <div style={{ fontSize: '11px', color: '#444', letterSpacing: '0.05em' }}>
          Owner-Operator Fleet Services
        </div>
      </div>

      {/* Title */}
      <div style={{ textAlign: 'center', marginBottom: '0.35in' }}>
        <div style={{ fontSize: '15px', fontWeight: 'bold', textDecoration: 'underline', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Certificate of Receipt — Company Testing Policy
        </div>
        <div style={{ fontSize: '11px', color: '#555', marginTop: '6px' }}>
          Federal Motor Carrier Safety Compliance Notice · 49 CFR § 382.601
        </div>
      </div>

      {/* Applicant info */}
      <div style={{ marginBottom: '0.3in', border: '1px solid #ccc', borderRadius: '4px', padding: '12px 16px', backgroundColor: '#f9f9f9' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <tbody>
            <tr>
              <td style={{ paddingBottom: '6px', color: '#555', width: '160px' }}>Applicant Name:</td>
              <td style={{ paddingBottom: '6px', fontWeight: 'bold' }}>{fullName}</td>
              {dob && (
                <>
                  <td style={{ paddingBottom: '6px', color: '#555', width: '120px', paddingLeft: '24px' }}>Date of Birth:</td>
                  <td style={{ paddingBottom: '6px', fontWeight: 'bold' }}>{dob}</td>
                </>
              )}
            </tr>
            <tr>
              <td style={{ color: '#555' }}>Email:</td>
              <td>{app.email}</td>
              <td style={{ color: '#555', paddingLeft: '24px' }}>Signed Date:</td>
              <td style={{ fontWeight: 'bold' }}>{signedDate}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Policy Text */}
      <div style={{ marginBottom: '0.3in' }}>
        <p style={{ fontWeight: 'bold', fontSize: '13px', marginBottom: '10px' }}>
          SUPERTRANSPORT — Federal Motor Carrier Safety Compliance Notice
        </p>

        <p style={{ marginBottom: '14px', fontSize: '12px', lineHeight: '1.6' }}>
          This document certifies that the undersigned applicant/contractor has received, read, and acknowledges understanding of SUPERTRANSPORT's Drug and Alcohol Testing Policy, as required by 49 CFR § 382.601. This policy governs all safety-sensitive functions performed under SUPERTRANSPORT's operating authority.
        </p>

        <p style={{ fontWeight: 'bold', fontSize: '12px', marginBottom: '8px', marginTop: '16px' }}>
          Regulatory Compliance
        </p>
        <p style={{ marginBottom: '14px', fontSize: '12px', lineHeight: '1.6' }}>
          You certify that you are familiar with the requirements of 49 CFR Parts 40, 382, and 391, and agree to comply with all applicable FMCSA regulations while operating under SUPERTRANSPORT's authority. You acknowledge that controlled substance and alcohol testing is a condition of performing safety-sensitive functions including, but not limited to, the operation of commercial motor vehicles with a GVWR of 26,001 pounds or more.
        </p>

        <p style={{ fontWeight: 'bold', fontSize: '12px', marginBottom: '8px', marginTop: '16px' }}>
          Testing Requirements
        </p>
        <p style={{ marginBottom: '14px', fontSize: '12px', lineHeight: '1.6' }}>
          You acknowledge that you are subject to the following categories of testing as required by federal regulation: pre-employment, random, reasonable suspicion, post-accident, return-to-duty, and follow-up testing. A positive test result, adulteration, substitution, or refusal to test will result in your immediate removal from all safety-sensitive duties and may result in permanent disqualification.
        </p>

        <p style={{ fontWeight: 'bold', fontSize: '12px', marginBottom: '8px', marginTop: '16px' }}>
          Consequences of Violations
        </p>
        <p style={{ marginBottom: '14px', fontSize: '12px', lineHeight: '1.6' }}>
          You understand and acknowledge that: (1) violations of the drug and alcohol policy will result in immediate removal from safety-sensitive duties; (2) you will be referred to a Substance Abuse Professional (SAP) if required under 49 CFR Part 40; (3) return to safety-sensitive duties requires successful completion of the SAP evaluation, any prescribed treatment, a return-to-duty test with a verified negative result, and any follow-up testing specified by the SAP; and (4) SUPERTRANSPORT is required to report verified positive test results to the FMCSA Drug & Alcohol Clearinghouse.
        </p>

        <p style={{ fontWeight: 'bold', fontSize: '12px', marginBottom: '8px', marginTop: '16px' }}>
          Application Certification
        </p>
        <p style={{ marginBottom: '14px', fontSize: '12px', lineHeight: '1.6' }}>
          You certify that all information provided in this application is accurate and complete to the best of your knowledge. You understand that providing false, incomplete, or misleading information may result in disqualification from consideration for employment or, if discovered after employment begins, in immediate termination of the contracting relationship. SUPERTRANSPORT reserves the right to verify all information provided and to take appropriate action for any misrepresentations.
        </p>
      </div>

      {/* Acceptance */}
      <div style={{
        border: `2px solid ${app.testing_policy_accepted ? '#2a6536' : '#ccc'}`,
        borderRadius: '4px',
        padding: '14px 16px',
        backgroundColor: app.testing_policy_accepted ? '#f0f7f1' : '#fafafa',
        marginBottom: '0.35in',
        fontSize: '12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
          <span style={{
            display: 'inline-block',
            width: '15px',
            height: '15px',
            border: '1.5px solid #000',
            borderRadius: '2px',
            textAlign: 'center',
            lineHeight: '13px',
            fontSize: '12px',
            fontWeight: 'bold',
            flexShrink: 0,
            marginTop: '1px',
            backgroundColor: app.testing_policy_accepted ? '#fff' : 'transparent',
          }}>
            {app.testing_policy_accepted ? '✓' : ''}
          </span>
          <p style={{ lineHeight: '1.5' }}>
            <strong>I accept the Terms and Conditions</strong>, acknowledge receipt of the Company Drug &amp; Alcohol Testing Policy as required by 49 CFR § 382.601, and certify that all information provided in this application is true and complete to the best of my knowledge.
          </p>
        </div>
        {!app.testing_policy_accepted && (
          <p style={{ color: '#cc4444', marginTop: '8px', fontStyle: 'italic', fontSize: '11px', paddingLeft: '25px' }}>
            ⚠ Not accepted by applicant
          </p>
        )}
      </div>

      {/* Signature block */}
      <div style={{ marginTop: '0.5in' }}>
        <div style={{ display: 'flex', gap: '60px', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            {sigSrc ? (
              <div>
                <img
                  src={sigSrc}
                  alt="Applicant signature"
                  style={{ maxHeight: '64px', maxWidth: '280px', objectFit: 'contain', display: 'block', marginBottom: '4px' }}
                />
                <div style={{ borderTop: '1px solid #000', paddingTop: '4px', fontSize: '11px', color: '#444' }}>
                  Applicant Signature
                </div>
              </div>
            ) : (
              <div>
                <div style={{ borderBottom: '1px solid #000', height: '50px' }} />
                <div style={{ paddingTop: '4px', fontSize: '11px', color: '#444' }}>Applicant Signature</div>
              </div>
            )}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ borderBottom: '1px solid #000', paddingBottom: '4px', fontWeight: 'bold', fontSize: '12px' }}>
              {app.typed_full_name || fullName}
            </div>
            <div style={{ paddingTop: '4px', fontSize: '11px', color: '#444' }}>Printed Name</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ borderBottom: '1px solid #000', paddingBottom: '4px', fontWeight: 'bold', fontSize: '12px' }}>
              {signedDate}
            </div>
            <div style={{ paddingTop: '4px', fontSize: '11px', color: '#444' }}>Date</div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ marginTop: '0.6in', borderTop: '1px solid #ccc', paddingTop: '10px', fontSize: '10px', color: '#888', textAlign: 'center' }}>
        SUPERTRANSPORT — Certificate of Receipt: Company Testing Policy · 49 CFR § 382.601 · Generated {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
      </div>
    </div>
  );
}
