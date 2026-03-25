import { FullApplication } from '@/components/management/ApplicationReviewDrawer';

interface Props {
  app: FullApplication;
}

export default function FCRAAuthorizationDoc({ app }: Props) {
  const fullName = [app.first_name, app.last_name].filter(Boolean).join(' ') || app.email;
  const signedDate = app.signed_date
    ? new Date(app.signed_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : '___________________';
  const dob = app.dob
    ? new Date(app.dob).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null;

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
          Fair Credit Reporting Act Authorization
        </div>
        <div style={{ fontSize: '11px', color: '#555', marginTop: '6px' }}>
          Applicant Disclosure and Authorization Form
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

      {/* Body */}
      <div style={{ marginBottom: '0.25in' }}>
        <p style={{ marginBottom: '14px' }}>
          I hereby authorize <strong>SUPERTRANSPORT</strong> to obtain a consumer report and/or investigative consumer report (background check) on me in connection with my application for employment and, if employed, on an ongoing basis for continued employment. I understand that these reports may be obtained at any time, including after my employment begins.
        </p>
        <p style={{ marginBottom: '14px' }}>
          I understand that a consumer report may contain information about me from personal interviews with my neighbors, friends, associates, former employers, and others. Such information may include my character, general reputation, personal characteristics, and mode of living.
        </p>
        <p style={{ marginBottom: '14px' }}>
          I understand that these reports may include information regarding: Social Security Number verification, residential history, employment history, education verification, personal and professional references, credit history, criminal records, motor vehicle records (MVR), driving history, and any other public records deemed relevant to the position.
        </p>
        <p style={{ marginBottom: '14px' }}>
          I understand that this investigation is a condition of my application and continued employment with SUPERTRANSPORT. I understand that I may request, in writing, that SUPERTRANSPORT provide me with additional disclosures as required by the Fair Credit Reporting Act (FCRA), 15 U.S.C. § 1681 et seq., including but not limited to: (1) a description of the nature and scope of any investigative consumer report; and (2) the name and contact information of any consumer reporting agency engaged to prepare a report about me.
        </p>
        <p style={{ marginBottom: '14px' }}>
          I further understand that under the FCRA, I have rights as a consumer, including the right to be informed if adverse employment action is taken based upon information contained in a consumer report, the right to obtain a copy of the report, and the right to dispute any inaccurate information in the report.
        </p>
        <p>
          I hereby release SUPERTRANSPORT, its employees, agents, and any consumer reporting agencies engaged by SUPERTRANSPORT from any and all liability arising from the procurement, disclosure, or use of information obtained pursuant to this authorization.
        </p>
      </div>

      {/* Certification */}
      <div style={{ border: '1px solid #ccc', borderRadius: '4px', padding: '12px 16px', backgroundColor: '#f9f9f9', marginBottom: '0.4in', fontSize: '12px' }}>
        <strong>Certification:</strong> By signing below, I certify that I have read and understand this disclosure, that I am authorizing the investigation described above, and that all information I have provided in my application is true and complete to the best of my knowledge.
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
        SUPERTRANSPORT — Applicant Authorization Form · FCRA Disclosure · Generated {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
      </div>
    </div>
  );
}
