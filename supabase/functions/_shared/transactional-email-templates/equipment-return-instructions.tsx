/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import {
  BRAND_NAME, accentBar, brand, callout, container, factCell,
  factLabel, factTable, footer, h1, h2, main, muted, subBrand, text,
} from './_pei-shared.ts'

export interface EquipmentReturnProps {
  driverName?: string
  items?: { label: string; serial: string | null }[]
  portalUrl?: string
  senderName?: string
  unitNumber?: string | null
}

const twoColRow = { verticalAlign: 'top' as const, width: '50%', height: '280px', padding: '0 8px' }
const addressCard = {
  backgroundColor: '#FAF8F2',
  border: '1px solid #EDE6CF',
  borderRadius: '6px',
  padding: '14px 16px',
  fontSize: '13px',
  color: '#0F0F0F',
  lineHeight: '1.55',
  height: '100%',
  minHeight: '280px',
  boxSizing: 'border-box' as const,
  'mso-line-height-rule': 'exactly',
}
const addressTitle = {
  fontSize: '13px',
  fontWeight: 'bold' as const,
  color: '#5A4A1F',
  margin: '0 0 6px',
  letterSpacing: '0.04em',
}

const ctaWrap = { textAlign: 'center' as const, margin: '22px 0 6px' }
const ctaButton = {
  backgroundColor: '#C9A84C',
  color: '#0D0D0D',
  fontSize: '15px',
  fontWeight: 'bold' as const,
  textDecoration: 'none',
  padding: '13px 26px',
  borderRadius: '6px',
  display: 'inline-block',
}

const EquipmentReturnInstructionsEmail = (props: EquipmentReturnProps) => {
  const driver = props.driverName || 'Driver'
  const items = props.items && props.items.length > 0
    ? props.items
    : [{ label: 'Equipment on file', serial: null }]
  const portalUrl = props.portalUrl || 'https://mysupertransport.lovable.app/status'
  const sender = props.senderName || `${BRAND_NAME} Operations`

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>Please return your {BRAND_NAME} equipment</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={brand}>{BRAND_NAME}</Heading>
          <Text style={subBrand}>EQUIPMENT RETURN — MAILING INSTRUCTIONS</Text>
          <div style={accentBar} />

          <Heading style={h1}>Please return your equipment</Heading>
          <Text style={text}>Hi {driver},</Text>
          {props.unitNumber ? (
            <Text style={muted}>Unit {props.unitNumber}</Text>
          ) : null}
          <Text style={text}>
            Our records show you're still holding company-issued equipment.
            Please ship the items listed below back to {BRAND_NAME} using
            <strong> either </strong> of the two addresses further down. You may
            choose whichever is more convenient — just make sure to keep the
            shipping receipt with the tracking number.
          </Text>

          <Heading style={h2}>Equipment to return</Heading>
          <table style={factTable} cellPadding={0} cellSpacing={0}>
            <tbody>
              {items.map((it, i) => {
                const last = i === items.length - 1
                return (
                  <tr key={i}>
                    <td style={last ? { ...factLabel, borderBottom: 'none' } : factLabel}>
                      {it.label}
                    </td>
                    <td style={last ? { ...factCell, borderBottom: 'none' } : factCell}>
                      {it.serial ? `Serial ${it.serial}` : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <Heading style={h2}>Ship to either address</Heading>
          <table cellPadding={0} cellSpacing={0} style={{ width: '100%', margin: '0 0 12px' }}>
            <tbody>
              <tr>
                <td style={twoColRow}>
                  <div style={addressCard}>
                    <div style={addressTitle}>OPTION 1 — THE UPS STORE #4564</div>
                    608 W. Parkway Dr.<br />
                    Russellville, AR 72801<br />
                    <span style={{ color: '#5A5A5A', whiteSpace: 'nowrap' }}>
                      P: (479) 498-2041
                    </span>
                  </div>
                </td>
                <td style={twoColRow}>
                  <div style={addressCard}>
                    <div style={addressTitle}>OPTION 2 — USPS (P.O. BOX)</div>
                    SuperTransport<br />
                    c/o Craig Pate<br />
                    P.O. Box 718<br />
                    Dover, AR 72837
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          <div style={callout}>
            <strong>Important:</strong> after you mail the equipment, open your
            Onboard Systems Assignment Sheet in the driver app and upload a photo
            of the shipping receipt along with the tracking number. Your account
            will remain open until at least one return receipt is on file.
          </div>

          <Text style={muted}>
            If a license plate is listed above, remove it from the truck and mail
            it back with the other items. Your truck registration stays with the
            truck and does not need to be returned.
          </Text>

          <Section style={ctaWrap}>
            <Button href={portalUrl} style={ctaButton}>
              Open Assignment Sheet &amp; Upload Receipt
            </Button>
          </Section>

          <Text style={muted}>
            Questions? Just reply to this email and it will reach {sender}.
          </Text>

          <Text style={footer}>— {BRAND_NAME} Operations</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: EquipmentReturnInstructionsEmail,
  subject: (data: Record<string, any>) =>
    `Action needed: return your ${BRAND_NAME} equipment`,
  displayName: 'Equipment Return — Mailing Instructions',
  previewData: {
    driverName: 'James Whitaker',
    items: [
      { label: 'ELD Unit', serial: 'ELD-8471' },
      { label: 'Dash Cam', serial: 'DC-2039' },
      { label: 'BestPass', serial: 'BP-771' },
      { label: 'Fuel Card', serial: '****4421' },
    ],
    portalUrl: 'https://mysupertransport.lovable.app/status',
    senderName: 'SUPERTRANSPORT Operations',
  },
} satisfies TemplateEntry