import CompanyLetterhead, { CompanyDocFooter } from '@/components/application/documents/CompanyLetterhead';
import { useCompanyIdentity } from '@/lib/application/identity';
import {
  buildApplicationDocument,
  type ApplicationRow,
  type DocBlock,
} from '@/lib/application/documentModel';

/**
 * The full-wording application, laid out for paper.
 *
 * The on-screen card is a scan-in-five-seconds summary: short labels, badges,
 * truncated cells. That is the wrong artifact to hand to an auditor, who needs
 * the sentence the applicant actually agreed to — not "Safety history: Yes".
 * This component renders the same data through the shared document model, so
 * it prints every question and disclosure in full.
 *
 * Kept in the DOM but hidden; openPrintableDocument clones it by id and forces
 * it visible in the print window.
 */
interface Props {
  id: string;
  application: ApplicationRow;
  signatureDataUrl?: string | null;
}

const SERIF = 'Times New Roman, serif';

function Block({ block, signatureDataUrl }: { block: DocBlock; signatureDataUrl?: string | null }) {
  switch (block.kind) {
    case 'paragraph':
      return <p style={{ margin: '0 0 10px', fontSize: '12px', lineHeight: 1.6 }}>{block.text}</p>;
    case 'notice':
      return (
        <div
          style={{
            border: '1px solid #E2D6AE',
            background: '#FBF7EC',
            borderRadius: '4px',
            padding: '10px 12px',
            fontSize: '11.5px',
            lineHeight: 1.6,
            fontStyle: 'italic',
            margin: '0 0 12px',
          }}
        >
          {block.text}
        </div>
      );
    case 'subheading':
      return (
        <div style={{ fontSize: '13px', fontWeight: 'bold', margin: '14px 0 8px' }}>{block.text}</div>
      );
    case 'field':
      return (
        <div style={{ margin: '0 0 8px', breakInside: 'avoid', pageBreakInside: 'avoid' }}>
          <div style={{ fontSize: '10px', color: '#555' }}>{block.label}</div>
          <div style={{ fontSize: '12.5px', fontWeight: 'bold' }}>{block.value}</div>
        </div>
      );
    case 'qa':
      return (
        <div style={{ margin: '0 0 12px', breakInside: 'avoid', pageBreakInside: 'avoid' }}>
          <div style={{ fontSize: '12px', lineHeight: 1.6 }}>{block.question}</div>
          <div style={{ fontSize: '12.5px', fontWeight: 'bold', marginTop: '3px', paddingLeft: '14px' }}>
            {block.answer}
          </div>
        </div>
      );
    case 'record':
      return (
        <div
          style={{
            border: '1px solid #ddd',
            borderRadius: '4px',
            padding: '10px 12px',
            margin: '0 0 10px',
            breakInside: 'avoid',
            pageBreakInside: 'avoid',
          }}
        >
          <div style={{ fontSize: '11px', fontWeight: 'bold', marginBottom: '6px' }}>{block.title}</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <tbody>
              {block.fields.map((f) => (
                <tr key={f.label}>
                  <td style={{ color: '#555', width: '38%', padding: '2px 8px 2px 0', verticalAlign: 'top' }}>
                    {f.label}
                  </td>
                  <td style={{ padding: '2px 0', verticalAlign: 'top' }}>{f.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'signature':
      return (
        <div style={{ marginTop: '0.35in', breakInside: 'avoid', pageBreakInside: 'avoid' }}>
          <div style={{ display: 'flex', gap: '40px', alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              {signatureDataUrl ? (
                <img
                  src={signatureDataUrl}
                  alt="Applicant signature"
                  style={{ maxHeight: '56px', maxWidth: '240px', objectFit: 'contain', display: 'block' }}
                />
              ) : (
                <div style={{ height: '46px' }} />
              )}
              <div style={{ borderTop: '1px solid #000', paddingTop: '3px', fontSize: '10px', color: '#555' }}>
                Applicant Signature
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ borderBottom: '1px solid #000', paddingBottom: '3px', fontWeight: 'bold', fontSize: '12px' }}>
                {block.printedName}
              </div>
              <div style={{ paddingTop: '3px', fontSize: '10px', color: '#555' }}>Printed Name</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ borderBottom: '1px solid #000', paddingBottom: '3px', fontWeight: 'bold', fontSize: '12px' }}>
                {block.date}
              </div>
              <div style={{ paddingTop: '3px', fontSize: '10px', color: '#555' }}>Date</div>
            </div>
          </div>
        </div>
      );
    default:
      return null;
  }
}

export default function ApplicationPrintDocument({ id, application, signatureDataUrl }: Props) {
  const identity = useCompanyIdentity();
  const model = buildApplicationDocument(application);

  return (
    <div id={id} style={{ display: 'none' }}>
      <div
        style={{
          padding: '0.75in',
          maxWidth: '8.5in',
          margin: '0 auto',
          background: '#fff',
          color: '#000',
          fontFamily: SERIF,
        }}
      >
        <CompanyLetterhead
          identity={identity}
          title={model.title}
          subtitle={`Applicant: ${model.applicantName}`}
        />

        {model.sections.map((section) => (
          <div key={section.title} style={{ marginBottom: '18px' }}>
            <div
              style={{
                borderLeft: '3px solid #C9A84C',
                background: '#F4F4F4',
                padding: '5px 10px',
                fontSize: '11px',
                fontWeight: 'bold',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                marginBottom: '10px',
                breakAfter: 'avoid',
                pageBreakAfter: 'avoid',
              }}
            >
              {section.title}
            </div>
            {section.blocks.map((block, i) => (
              <Block key={i} block={block} signatureDataUrl={signatureDataUrl} />
            ))}
          </div>
        ))}

        <CompanyDocFooter identity={identity} docLabel="Driver Application for Employment" />
      </div>
    </div>
  );
}
