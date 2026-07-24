import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  operatorName?: string
  assignmentDate?: string
  unitNumber?: string | null
  devices?: { type: string; serial: string }[]
  bestpassIncluded?: boolean
  signUrl?: string
}

export default function OsasSignRequestEmail({
  operatorName = 'Driver',
  assignmentDate,
  unitNumber,
  devices = [],
  bestpassIncluded = false,
  signUrl,
}: Props) {
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>Onboard Systems Assignment Sheet — please review and sign</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Onboard Systems Assignment Sheet</Heading>
          <Text style={text}>Hi {operatorName},</Text>
          <Text style={text}>
            An Onboard Systems Assignment Sheet (OSAS) has been created for your unit.
            Please review the listed devices and sign to acknowledge receipt and responsibility.
          </Text>

          {unitNumber && (
            <Section style={detailBox}>
              <Text style={detailLabel}>Unit Number</Text>
              <Text style={detailValue}>{unitNumber}</Text>
            </Section>
          )}

          {assignmentDate && (
            <Section style={detailBox}>
              <Text style={detailLabel}>Assignment Date</Text>
              <Text style={detailValue}>{assignmentDate}</Text>
            </Section>
          )}

          <Section style={detailBox}>
            <Text style={detailLabel}>Assigned Devices</Text>
            {devices.length === 0 ? (
              <Text style={detailValue}>No devices listed</Text>
            ) : (
              <ul style={list}>
                {devices.map((d, i) => (
                  <li key={i} style={listItem}>
                    <strong>{labelFor(d.type)}</strong>: {d.serial}
                  </li>
                ))}
                {bestpassIncluded && (
                  <li style={listItem}>
                    <strong>BestPass fee</strong>: $60.00 acknowledged
                  </li>
                )}
              </ul>
            )}
          </Section>

          <Section style={noticeBox}>
            <Text style={noticeText}>
              <strong>Important:</strong> Unreturned ELD equipment will result in a $1,000.00 replacement charge.
              Additional charges may apply for unreturned license plates or other issued equipment.
            </Text>
          </Section>

          {signUrl && (
            <Section style={ctaSection}>
              <Button href={signUrl} style={cta}>
                Review & Sign Sheet
              </Button>
            </Section>
          )}

          <Hr style={hr} />
          <Text style={footer}>
            If you have questions about the devices listed, please contact your onboarding specialist.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

function labelFor(type: string) {
  switch (type) {
    case 'eld': return 'ELD Unit'
    case 'dash_cam': return 'Dash Camera'
    case 'bestpass': return 'BestPass'
    default: return type
  }
}

export const template = {
  component: OsasSignRequestEmail,
  subject: 'Action Required: Review & Sign Onboard Systems Assignment Sheet',
  displayName: 'Onboard Systems Assignment Sign Request',
  previewData: {
    operatorName: 'Marcus Sample',
    assignmentDate: '01/01/2026',
    unitNumber: '000',
    devices: [
      { type: 'eld', serial: 'ELD-001234' },
      { type: 'dash_cam', serial: 'CAM-998877' },
    ],
    bestpassIncluded: true,
    signUrl: 'https://example.com/sign',
  },
} satisfies TemplateEntry

const main = {
  backgroundColor: '#f5f5f5',
  fontFamily: 'Arial, sans-serif',
  padding: '24px 0',
}

const container = {
  backgroundColor: '#ffffff',
  borderRadius: '8px',
  padding: '32px 28px',
  maxWidth: '600px',
  margin: '0 auto',
}

const heading = {
  color: '#0D0D0D',
  fontSize: '22px',
  fontWeight: 700,
  margin: '0 0 20px',
}

const text = {
  color: '#333333',
  fontSize: '14px',
  lineHeight: '1.5',
  margin: '0 0 16px',
}

const detailBox = {
  backgroundColor: '#fafafa',
  border: '1px solid #e5e5e5',
  borderRadius: '6px',
  padding: '12px 16px',
  marginBottom: '12px',
}

const detailLabel = {
  color: '#666666',
  fontSize: '11px',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
  margin: '0 0 4px',
}

const detailValue = {
  color: '#0D0D0D',
  fontSize: '15px',
  fontWeight: 600,
  margin: 0,
}

const list = {
  margin: '0',
  paddingLeft: '18px',
  color: '#333333',
  fontSize: '14px',
  lineHeight: '1.6',
}

const listItem = {
  marginBottom: '4px',
}

const noticeBox = {
  backgroundColor: '#fff8e6',
  border: '1px solid #f5deb3',
  borderRadius: '6px',
  padding: '12px 16px',
  marginBottom: '20px',
}

const noticeText = {
  color: '#5c4b1e',
  fontSize: '13px',
  lineHeight: '1.5',
  margin: 0,
}

const ctaSection = {
  textAlign: 'center' as const,
  margin: '24px 0',
}

const cta = {
  backgroundColor: '#C9A84C',
  color: '#0D0D0D',
  borderRadius: '6px',
  padding: '12px 24px',
  fontSize: '14px',
  fontWeight: 600,
  textDecoration: 'none',
  display: 'inline-block',
}

const hr = {
  borderColor: '#e5e5e5',
  margin: '24px 0',
}

const footer = {
  color: '#888888',
  fontSize: '12px',
  lineHeight: '1.4',
  margin: 0,
}
