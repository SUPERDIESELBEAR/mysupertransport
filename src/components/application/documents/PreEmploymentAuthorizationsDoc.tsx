import { FullApplication } from '@/components/management/ApplicationReviewDrawer';

interface Props {
  app: FullApplication;
  signatureDataUrl?: string | null;
}

export default function PreEmploymentAuthorizationsDoc({ app, signatureDataUrl }: Props) {
  const fullName = [app.first_name, app.last_name].filter(Boolean).join(' ') || app.email;
  const signedDate = app.signed_date
    ? new Date(app.signed_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : '___________________';
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
          IMPORTANT DISCLOSURE
        </div>
        <div style={{ fontSize: '13px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '6px' }}>
          REGARDING BACKGROUND REPORTS FROM THE PSP Online Service
        </div>
      </div>

      {/* Applicant info */}
      <div style={{ marginBottom: '0.3in', border: '1px solid #ccc', borderRadius: '4px', padding: '12px 16px', backgroundColor: '#f9f9f9' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <tbody>
            <tr>
              <td style={{ paddingBottom: '6px', color: '#555', width: '160px' }}>Applicant Name:</td>
              <td style={{ paddingBottom: '6px', fontWeight: 'bold' }}>{fullName}</td>
              <td style={{ paddingBottom: '6px', color: '#555', width: '120px', paddingLeft: '24px' }}>Signed Date:</td>
              <td style={{ paddingBottom: '6px', fontWeight: 'bold' }}>{signedDate}</td>
            </tr>
            <tr>
              <td style={{ color: '#555' }}>Email:</td>
              <td>{app.email}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Disclosure Body */}
      <div style={{ marginBottom: '0.3in', fontSize: '12px', lineHeight: '1.7' }}>
        <p style={{ marginBottom: '12px' }}>
          In connection with your application for employment with SUPERTRANSPORT, LLC ("Prospective Employer"), Prospective Employer, its employees, agents, or contractors may obtain one or more reports regarding your driving and safety inspection history from the Federal Motor Carrier Safety Administration (FMCSA).
        </p>
        <p style={{ marginBottom: '12px' }}>
          When the application for employment is submitted in person, if the Prospective Employer uses any information it obtains from FMCSA in a decision to not hire you or to make any other adverse employment decision regarding you, the Prospective Employer will provide you with a copy of the report upon which its decision was based and a written summary of your rights under the Fair Credit Reporting Act before taking any final adverse action. If any final adverse action is taken against you based upon your driving history or safety report, the Prospective Employer will notify you that the action has been taken and that the action was based in part or in whole on this report.
        </p>
        <p style={{ marginBottom: '12px' }}>
          When the application for employment is submitted by mail, telephone, computer, or other similar means, if the Prospective Employer uses any information it obtains from FMCSA in a decision to not hire you or to make any other adverse employment decision regarding you, the Prospective Employer must provide you within three business days of taking adverse action oral, written or electronic notification: that adverse action has been taken based in whole or in part on information obtained from FMCSA; the name, address, and the toll free telephone number of FMCSA; that the FMCSA did not make the decision to take the adverse action and is unable to provide you the specific reasons why the adverse action was taken; and that you may, upon providing proper identification, request a free copy of the report and may dispute with the FMCSA the accuracy or completeness of any information or report. If you request a copy of a driver record from the Prospective Employer who procured the report, then, within 3 business days of receiving your request, together with proper identification, the Prospective Employer must send or provide to you a copy of your report and a summary of your rights under the Fair Credit Reporting Act.
        </p>
        <p style={{ marginBottom: '12px' }}>
          Neither the Prospective Employer nor the FMCSA contractor supplying the crash and safety information has the capability to correct any safety data that appears to be incorrect. You may challenge the accuracy of the data by submitting a request to https://dataqs.fmcsa.dot.gov. If you challenge crash, or inspection information reported by a State, FMCSA cannot change or correct this data. Your request will be forwarded by the DataQs system to the appropriate State for adjudication.
        </p>
        <p style={{ marginBottom: '12px' }}>
          Any crash or inspection in which you were involved will display on your PSP report. Since the PSP report does not report, assign, or imply fault, it will include all Commercial Motor Vehicle (CMV) crashes where you were a driver or co-driver and where those crashes were reported to FMCSA, regardless of fault. Similarly, all inspections, whether or not they involve violations, appear on the PSP report. State citations associated with Federal Motor Carrier Safety Regulations (FMCSR) violations that have been adjudicated by a court of law will also appear, and remain, on a PSP report.
        </p>
        <p style={{ marginBottom: '0' }}>
          The Prospective Employer cannot obtain background reports from FMCSA without your authorization.
        </p>
      </div>

      {/* Authorization Section */}
      <div style={{ borderTop: '2px solid #000', paddingTop: '0.25in', marginBottom: '0.3in' }}>
        <div style={{ fontSize: '14px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>
          AUTHORIZATION
        </div>
        <div style={{ fontSize: '12px', lineHeight: '1.7' }}>
          <p style={{ marginBottom: '12px' }}>
            If you agree that the Prospective Employer may obtain such background reports, please read the following and sign below: I authorize SUPERTRANSPORT, LLC ("Prospective Employer") to access the FMCSA Pre-Employment Screening Program (PSP) system to seek information regarding my commercial driving safety record and information regarding my safety inspection history. I understand that I am authorizing the release of safety performance information, including crash data from the previous five (5) years and inspection history from the previous three (3) years. I understand and acknowledge that this release of information may assist the Prospective Employer to make a determination regarding my suitability as an employee.
          </p>
          <p style={{ marginBottom: '12px' }}>
            I further understand that neither the Prospective Employer nor the FMCSA contractor supplying the crash and safety information has the capability to correct any safety data that appears to be incorrect. I understand I may challenge the accuracy of the data by submitting a request to https://dataqs.fmcsa.dot.gov. If I challenge, crash, or inspection information reported by a State, FMCSA cannot change or correct this data. I understand my request will be forwarded by the DataQs system to the appropriate State for adjudication.
          </p>
          <p style={{ marginBottom: '12px' }}>
            I understand that any crash or inspection in which I was involved will display on my PSP report. Since the PSP report does not report, assign, or imply fault, I acknowledge it will include all CMV crashes in which I was a driver or co-driver and were reported to the FMCSA, regardless of fault. Similarly, I understand all inspections, with or without violations, will appear on my PSP report, and State citations associated with FMCSR violations that have been adjudicated by a court of law will also appear, and remain on my PSP report.
          </p>
          <p>
            I have read the above Disclosure Regarding Background Reports provided to me by Prospective Employer and I understand that if I sign this Disclosure and Authorization, Prospective Employer may obtain a report of my crash and inspection history. I hereby authorize Prospective Employer and its employees, authorized agents, and/or affiliates to obtain the information authorized above.
          </p>
        </div>
      </div>

      {/* Signature block — stacked labeled fields matching source document */}
      <div style={{ marginTop: '0.4in', fontSize: '12px', lineHeight: '2' }}>
        {/* Date */}
        <div style={{ marginBottom: '16px' }}>
          <span>Date: </span>
          <span style={{ fontWeight: 'bold' }}>{signedDate}</span>
        </div>
        {/* Signature */}
        <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
          <span style={{ whiteSpace: 'nowrap' }}>Signature: </span>
          <div style={{ flex: 1, maxWidth: '360px' }}>
            {sigSrc ? (
              <img src={sigSrc} alt="Signature" style={{ height: '40px', maxWidth: '100%', display: 'block' }} />
            ) : (
              <div style={{ borderBottom: '1px solid #000', height: '40px' }} />
            )}
          </div>
        </div>
        {/* Name (Please Print) */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
          <span style={{ whiteSpace: 'nowrap' }}>Name (Please Print): </span>
          <div style={{ flex: 1, maxWidth: '320px', borderBottom: '1px solid #000', paddingBottom: '2px', fontWeight: 'bold' }}>
            {app.typed_full_name || fullName}
          </div>
        </div>
      </div>

      {/* NOTICE */}
      <div style={{ marginTop: '0.4in', border: '1px solid #ccc', borderRadius: '4px', padding: '12px 16px', backgroundColor: '#f9f9f9', fontSize: '10px', lineHeight: '1.6', color: '#444' }}>
        <strong style={{ color: '#000' }}>NOTICE:</strong> This form is made available to monthly account holders by NIC on behalf of the U.S. Department of Transportation, Federal Motor Carrier Safety Administration (FMCSA). Account holders are required by federal law to obtain an Applicant's written or electronic consent prior to accessing the Applicant's PSP report. Further, account holders are required by FMCSA to use the language contained in this Disclosure and Authorization form to obtain an Applicant's consent. The language must be used in whole, exactly as provided. Further, the language on this form must exist as one stand-alone document. The language may NOT be included with other consent forms or any other language. NOTICE: The prospective employment concept referenced in this form contemplates the definition of "employee" contained at 49 C.F.R. 383.5.
      </div>

      {/* Footer */}
      <div style={{ marginTop: '0.4in', borderTop: '1px solid #ccc', paddingTop: '10px', fontSize: '10px', color: '#888', textAlign: 'center' }}>
        SUPERTRANSPORT — PSP Authorization · Generated {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
      </div>
    </div>
  );
}
