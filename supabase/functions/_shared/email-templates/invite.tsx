/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({
  siteName,
  siteUrl,
  confirmationUrl,
}: InviteEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Welcome aboard — set up your SUPERDRIVE account</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={brand}>SUPERTRANSPORT</Heading>
        <div style={accentBar} />
        <Heading style={h1}>Welcome aboard</Heading>
        <Text style={text}>
          Your operator account at{' '}
          <Link href={siteUrl} style={link}>
            <strong>SUPERTRANSPORT</strong>
          </Link>{' '}
          is ready. Set your password to get started — it takes less than a minute.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Set Your Password &amp; Get Started
        </Button>

        <Heading style={h2}>Install SUPERDRIVE on your phone</Heading>
        <Text style={text}>
          SUPERDRIVE is your operator app — install it for one-tap access to
          documents, dispatch status, settlements, and messages.
        </Text>

        <table cellPadding={0} cellSpacing={0} role="presentation" style={cardTable}>
          <tbody>
            <tr>
              <td style={cardCell}>
                <Text style={cardTitle}>📱 iPhone (Safari)</Text>
                <Text style={cardStep}>1. Open this email in Safari</Text>
                <Text style={cardStep}>2. Tap the Share button</Text>
                <Text style={cardStep}>3. Choose "Add to Home Screen"</Text>
              </td>
              <td style={cardSpacer} />
              <td style={cardCell}>
                <Text style={cardTitle}>🤖 Android (Chrome)</Text>
                <Text style={cardStep}>1. Open this email in Chrome</Text>
                <Text style={cardStep}>2. Tap the ⋮ menu</Text>
                <Text style={cardStep}>3. Choose "Install app"</Text>
              </td>
            </tr>
          </tbody>
        </table>

        <Heading style={h2}>What's next</Heading>
        <Text style={text}>
          You'll be guided through 8 onboarding stages: profile, documents,
          truck photos, MO registration, equipment setup, ICA signing,
          inspection, and pay setup. Our team is with you every step.
        </Text>

        <Text style={footer}>
          Questions? Reply to this email — we're here to help.
          <br />— The SUPERTRANSPORT team
        </Text>
      </Container>
    </Body>
  </Html>
)

export default InviteEmail

const main = {
  backgroundColor: '#ffffff',
  fontFamily:
    'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif',
}
const container = { padding: '32px 28px', maxWidth: '600px' }
const brand = {
  fontSize: '14px',
  fontWeight: 'bold' as const,
  color: '#0F0F0F',
  letterSpacing: '0.18em',
  margin: '0 0 12px',
}
const accentBar = {
  width: '48px',
  height: '3px',
  backgroundColor: '#C9A84C',
  margin: '0 0 28px',
}
const h1 = {
  fontSize: '26px',
  fontWeight: 'bold' as const,
  color: '#0F0F0F',
  margin: '0 0 16px',
  lineHeight: '1.25',
}
const h2 = {
  fontSize: '18px',
  fontWeight: 'bold' as const,
  color: '#0F0F0F',
  margin: '36px 0 12px',
}
const text = {
  fontSize: '15px',
  color: '#3F3F3F',
  lineHeight: '1.6',
  margin: '0 0 20px',
}
const link = { color: '#C9A84C', textDecoration: 'underline' }
const button = {
  backgroundColor: '#C9A84C',
  color: '#0F0F0F',
  fontSize: '15px',
  fontWeight: 'bold' as const,
  borderRadius: '6px',
  padding: '14px 26px',
  textDecoration: 'none',
  display: 'inline-block',
}
const cardTable = {
  width: '100%',
  margin: '8px 0 0',
  borderCollapse: 'separate' as const,
}
const cardCell = {
  width: '48%',
  verticalAlign: 'top' as const,
  backgroundColor: '#FAF8F2',
  border: '1px solid #EDE6CF',
  borderRadius: '6px',
  padding: '16px',
}
const cardSpacer = { width: '4%' }
const cardTitle = {
  fontSize: '14px',
  fontWeight: 'bold' as const,
  color: '#0F0F0F',
  margin: '0 0 10px',
}
const cardStep = {
  fontSize: '13px',
  color: '#3F3F3F',
  lineHeight: '1.5',
  margin: '0 0 4px',
}
const footer = {
  fontSize: '12px',
  color: '#7A7A7A',
  lineHeight: '1.6',
  margin: '36px 0 0',
  borderTop: '1px solid #EAEAEA',
  paddingTop: '20px',
}
