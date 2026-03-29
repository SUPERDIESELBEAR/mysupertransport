import { FullApplication } from '@/components/management/ApplicationReviewDrawer';

interface Props {
  app: FullApplication;
  signatureDataUrl?: string | null;
}

/** Normalize boolean | string | null → boolean | null */
function toBool(v: unknown): boolean | null {
  if (v === true || v === 'yes' || v === 'Yes') return true;
  if (v === false || v === 'no' || v === 'No') return false;
  return null;
}

function AnswerRow({ answer }: { answer: boolean | null }) {
  if (answer === null || answer === undefined) return (
    <div style={{ display: 'inline-flex', gap: '20px', fontSize: '12px' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ display: 'inline-block', width: '13px', height: '13px', border: '1.5px solid #000', borderRadius: '50%' }} />
        Yes
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ display: 'inline-block', width: '13px', height: '13px', border: '1.5px solid #000', borderRadius: '50%' }} />
        No
      </span>
      <span style={{ color: '#999', fontStyle: 'italic', fontSize: '11px' }}>(Not answered)</span>
    </div>
  );
  return (
    <div style={{ display: 'inline-flex', gap: '20px', fontSize: '12px' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: answer ? 'bold' : 'normal' }}>
        <span style={{
          display: 'inline-block', width: '13px', height: '13px', border: '1.5px solid #000', borderRadius: '50%',
          backgroundColor: answer ? '#000' : 'transparent',
        }} />
        Yes
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: !answer ? 'bold' : 'normal' }}>
        <span style={{
          display: 'inline-block', width: '13px', height: '13px', border: '1.5px solid #000', borderRadius: '50%',
          backgroundColor: !answer ? '#000' : 'transparent',
        }} />
        No
      </span>
    </div>
  );
}

export default function DOTDrugAlcoholQuestionsDoc({ app, signatureDataUrl }: Props) {
  const fullName = [app.first_name, app.last_name].filter(Boolean).join(' ') || app.email;
  const signedDate = app.signed_date
    ? new Date(app.signed_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : '___________________';
  const dob = app.dob
    ? new Date(app.dob).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null;

  const q1 = toBool(app.dot_positive_test_past_2yr);
  const q2 = toBool(app.dot_return_to_duty_docs);
  const sap = toBool(app.sap_process);
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
          DOT Drug &amp; Alcohol Pre-Employment Questions
        </div>
        <div style={{ fontSize: '11px', color: '#555', marginTop: '6px' }}>
          49 CFR Part 40.25(j) Mandatory Disclosure
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

      {/* Notice */}
      <div style={{ border: '1.5px solid #333', borderRadius: '4px', padding: '12px 16px', marginBottom: '0.3in', backgroundColor: '#f9f9f9', fontSize: '12px' }}>
        <strong>49 CFR Part 40.25(j) Notice:</strong> As required by federal regulations, you must answer the following questions truthfully. This information will be used to assess your eligibility to perform safety-sensitive transportation functions. Providing false information is a federal violation and may result in immediate disqualification or termination.
      </div>

      {/* Questions */}
      <div style={{ marginBottom: '0.35in' }}>

        {/* Question 1 */}
        <div style={{ marginBottom: '24px', padding: '16px', border: '1px solid #ccc', borderRadius: '4px' }}>
          <p style={{ fontWeight: 'bold', marginBottom: '10px', fontSize: '13px' }}>
            Question 1 of 2
          </p>
          <p style={{ marginBottom: '14px', fontSize: '12px', lineHeight: '1.6' }}>
            Have you tested positive, or refused to test, on any pre-employment drug or alcohol test administered by an employer to which you applied for, but did not obtain, safety-sensitive transportation work covered by DOT agency drug and alcohol testing rules during the past two (2) years?
          </p>
          <div style={{ paddingLeft: '16px', paddingTop: '8px', borderTop: '1px dashed #ccc' }}>
            <span style={{ fontSize: '11px', color: '#555', marginRight: '12px', fontStyle: 'italic' }}>Applicant Answer:</span>
            <AnswerRow answer={q1} />
          </div>
        </div>

        {/* Question 2 — always shown */}
        <div style={{ marginBottom: '24px', padding: '16px', border: '1px solid #ccc', borderRadius: '4px' }}>
          <p style={{ fontWeight: 'bold', marginBottom: '10px', fontSize: '13px' }}>
            Question 2 of 2
            {q1 === false && (
              <span style={{ fontSize: '11px', color: '#777', fontWeight: 'normal', marginLeft: '8px', fontStyle: 'italic' }}>
                (Applicable only if Question 1 answered "Yes")
              </span>
            )}
          </p>
          <p style={{ marginBottom: '14px', fontSize: '12px', lineHeight: '1.6' }}>
            If you answered "Yes" to Question 1 above: Have you successfully completed the return-to-duty process required by 49 CFR Part 40, including a substance abuse professional (SAP) evaluation, any prescribed education or treatment, a return-to-duty test, and any required follow-up tests?
          </p>
          <div style={{ paddingLeft: '16px', paddingTop: '8px', borderTop: '1px dashed #ccc' }}>
            <span style={{ fontSize: '11px', color: '#555', marginRight: '12px', fontStyle: 'italic' }}>Applicant Answer:</span>
            {q1 === false ? (
              <span style={{ fontSize: '12px', color: '#777', fontStyle: 'italic' }}>N/A — Question 1 answered "No"</span>
            ) : (
              <AnswerRow answer={q2} />
            )}
          </div>
        </div>

        {/* SAP Process */}
        {sap !== null && (
          <div style={{ marginBottom: '24px', padding: '16px', border: '1px solid #ccc', borderRadius: '4px', backgroundColor: '#fffdf5' }}>
            <p style={{ fontWeight: 'bold', marginBottom: '10px', fontSize: '13px' }}>
              SAP Process Status
            </p>
            <p style={{ fontSize: '12px', marginBottom: '10px', lineHeight: '1.6' }}>
              Are you currently engaged in or have you completed a Substance Abuse Professional (SAP) return-to-duty process?
            </p>
            <div style={{ paddingLeft: '16px', paddingTop: '8px', borderTop: '1px dashed #ccc' }}>
              <span style={{ fontSize: '11px', color: '#555', marginRight: '12px', fontStyle: 'italic' }}>Applicant Answer:</span>
              <AnswerRow answer={sap} />
            </div>
          </div>
        )}
      </div>

      {/* Certification */}
      <div style={{ border: '1px solid #ccc', borderRadius: '4px', padding: '12px 16px', backgroundColor: '#f9f9f9', marginBottom: '0.4in', fontSize: '12px' }}>
        <strong>Certification:</strong> I certify under penalty of law that my answers above are true and complete to the best of my knowledge. I understand that providing false or misleading information is a violation of federal regulations and may result in disqualification from employment, termination, or civil/criminal penalties.
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
        SUPERTRANSPORT — DOT Drug &amp; Alcohol Pre-Employment Questions · 49 CFR § 40.25(j) · Generated {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
      </div>
    </div>
  );
}
