import logo from '@/assets/supertransport-logo.png';
import { identityRegistrationLine, type CompanyIdentity } from '@/lib/application/identity';

/**
 * The branded head of every printed application document.
 *
 * Deliberately inline-styled rather than Tailwind-classed: these documents are
 * cloned into a bare print window, and a utility class that fails to resolve
 * there would silently strip the company's identity off a signed federal form.
 * Inline styles travel with the node.
 *
 * Address policy: locality only. The street address is intentionally omitted
 * from applicant-facing documents.
 */
interface Props {
  identity: CompanyIdentity;
  title: string;
  subtitle?: string;
}

export default function CompanyLetterhead({ identity, title, subtitle }: Props) {
  return (
    <div style={{ marginBottom: '0.35in' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          paddingBottom: '10px',
          borderBottom: '2px solid #C9A84C',
        }}
      >
        <img
          src={logo}
          alt={identity.legalName}
          style={{ height: '52px', width: 'auto', objectFit: 'contain', flexShrink: 0 }}
        />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#000', letterSpacing: '0.02em' }}>
            {identity.legalName}
          </div>
          <div style={{ fontSize: '11px', color: '#444' }}>{identity.locality}</div>
          <div style={{ fontSize: '11px', color: '#444' }}>{identityRegistrationLine(identity)}</div>
        </div>
      </div>

      <div style={{ textAlign: 'center', marginTop: '0.3in' }}>
        <div
          style={{
            fontSize: '15px',
            fontWeight: 'bold',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: '#000',
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div style={{ fontSize: '11px', color: '#555', marginTop: '6px' }}>{subtitle}</div>
        )}
      </div>
    </div>
  );
}

/** Matching foot rule — the same identity line, repeated for detached pages. */
export function CompanyDocFooter({
  identity,
  docLabel,
}: {
  identity: CompanyIdentity;
  docLabel: string;
}) {
  const generated = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  return (
    <div
      style={{
        marginTop: '0.6in',
        borderTop: '1px solid #ccc',
        paddingTop: '10px',
        fontSize: '10px',
        color: '#777',
        textAlign: 'center',
        lineHeight: 1.5,
      }}
    >
      <div>
        {identity.legalName} · {identity.locality} · {identityRegistrationLine(identity)}
      </div>
      <div>
        {docLabel} · Generated {generated}
      </div>
    </div>
  );
}
