/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text,
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
}

const twoColRow = { verticalAlign: 'top' as const, width: '50%', padding: '0 8px' }
const addressCard = {
  backgroundColor: '#FAF8F2',
  border: '1px solid #EDE6CF',
  borderRadius: '6px',
  padding: '14px 16px',
  fontSize: '13px',
  color: '#0F0F0F',
  lineHeight: '1.55',
}
const addressTitle = {
  fontSize: '13px',
  fontWeight: 'bold' as const,
  color: '#5A4A1F',
  margin: '0 0 6px',
  letterSpacing: '0.04em',
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
                    <span style={{ color: '#5A5A5A' }}>
                      Mon–Fri 7:30a–6:00p<br />
                      Sat 9:00a–2:30p · Sun 10:00a–3:00p<br />
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
            <strong>Important:</strong> after you mail the equipment, open the
            {' '}<a href={portalUrl} style={{ color: '#5A4A1F', textDecoration: 'underline' }}>
              Equipment Asset Sheet
            </a>{' '}
            in your driver app and upload a photo of the shipping receipt along
            with the carrier and tracking number. Your account will remain open
            until at least one return receipt is on file.
          </div>

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