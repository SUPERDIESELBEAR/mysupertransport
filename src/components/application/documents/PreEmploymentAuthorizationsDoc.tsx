import { FullApplication } from '@/components/management/ApplicationReviewDrawer';

interface Props {
  app: FullApplication;
}

function CheckBox({ checked }: { checked: boolean | null }) {
  return (
    <span style={{
      display: 'inline-block',
      width: '14px',
      height: '14px',
      border: '1.5px solid #000',
      borderRadius: '2px',
      textAlign: 'center',
      lineHeight: '12px',
      fontSize: '11px',
      fontWeight: 'bold',
      marginRight: '8px',
      verticalAlign: 'middle',
      flexShrink: 0,
    }}>
      {checked ? '✓' : ''}
    </span>
  );
}

export default function PreEmploymentAuthorizationsDoc({ app }: Props) {
  const fullName = [app.first_name, app.last_name].filter(Boolean).join(' ') || app.email;
  const signedDate = app.signed_date
    ? new Date(app.signed_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : '___________________';
  const dob = app.dob
    ? new Date(app.dob).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null;

  const authorizations = [
    {
      key: 'auth_safety_history',
      checked: app.auth_safety_history,
      title: 'Safety Performance History Authorization',
      text: 'I authorize this motor carrier to investigate my safety performance history with previous employers as required by FMCSA regulations (49 CFR Part 391). I understand this includes my accident register, roadside inspection history, and any records of violations, suspensions, or disqualifications related to the operation of commercial motor vehicles.',
      cite: '49 CFR § 391.23',
    },
    {
      key: 'auth_drug_alcohol',
      checked: app.auth_drug_alcohol,
      title: 'DOT Drug & Alcohol Testing History Authorization',
      text: 'I consent to the release of information regarding my DOT drug and alcohol testing history from previous employers as required by 49 CFR § 40.25, including records held in the FMCSA Drug & Alcohol Clearinghouse. I authorize all previous DOT-regulated employers within the past three (3) years to provide complete records of all pre-employment, random, reasonable suspicion, post-accident, return-to-duty, and follow-up drug and alcohol tests.',
      cite: '49 CFR § 40.25 / FMCSA Clearinghouse',
    },
    {
      key: 'auth_previous_employers',
      checked: app.auth_previous_employers,
      title: 'Previous Employer Records Authorization',
      text: 'I authorize the release of employment records, performance information, personnel files, and other relevant data from previous employers, government agencies, educational institutions, and professional references to SUPERTRANSPORT. This includes verification of job titles, dates of employment, job responsibilities, wage/salary information, and reasons for separation.',
      cite: 'General Employment Authorization',
    },
  ];

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
          Pre-Employment Authorizations
        </div>
        <div style={{ fontSize: '11px', color: '#555', marginTop: '6px' }}>
          Applicant Release and Authorization Form
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

      {/* Intro */}
      <p style={{ marginBottom: '0.25in', fontSize: '12px' }}>
        As part of the application process with SUPERTRANSPORT, the undersigned applicant hereby grants the following authorizations. Each authorization checked below has been individually acknowledged and agreed to by the applicant.
      </p>

      {/* Authorization items */}
      <div style={{ marginBottom: '0.35in' }}>
        {authorizations.map((auth) => (
          <div
            key={auth.key}
            style={{
              marginBottom: '20px',
              border: `1.5px solid ${auth.checked ? '#2a6536' : '#ccc'}`,
              borderRadius: '4px',
              padding: '14px 16px',
              backgroundColor: auth.checked ? '#f0f7f1' : '#fafafa',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '8px' }}>
              <CheckBox checked={auth.checked} />
              <div style={{ flex: 1 }}>
                <strong style={{ fontSize: '13px' }}>{auth.title}</strong>
                <span style={{ fontSize: '10px', color: '#777', marginLeft: '8px', fontStyle: 'italic' }}>{auth.cite}</span>
              </div>
            </div>
            <p style={{ fontSize: '12px', marginLeft: '22px', color: '#333', lineHeight: '1.5' }}>{auth.text}</p>
            {!auth.checked && (
              <p style={{ fontSize: '11px', color: '#cc4444', marginLeft: '22px', marginTop: '6px', fontStyle: 'italic' }}>
                ⚠ Not authorized by applicant
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Certification */}
      <div style={{ border: '1px solid #ccc', borderRadius: '4px', padding: '12px 16px', backgroundColor: '#f9f9f9', marginBottom: '0.4in', fontSize: '12px' }}>
        <strong>Acknowledgment:</strong> By signing below, I certify that the checkboxes above accurately reflect my authorizations and that I have read and understand each release. I acknowledge that these authorizations are voluntary but that declining to provide them may affect my eligibility for employment.
      </div>

      {/* Signature block */}
      <div style={{ marginTop: '0.5in' }}>
        <div style={{ display: 'flex', gap: '60px', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            {app.signature_image_url ? (
              <div>
                <img
                  src={app.signature_image_url}
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
        SUPERTRANSPORT — Pre-Employment Authorizations · Generated {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
      </div>
    </div>
  );
}
