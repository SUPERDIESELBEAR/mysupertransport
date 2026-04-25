/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your verification code</Preview>
    <Body style={main}>
      <Container style={container}>
                <Heading style={brand}>SUPERTRANSPORT</Heading>
        <div style={accentBar} />
        <Heading style={h1}>Confirm reauthentication</Heading>
        <Text style={text}>Use the code below to confirm your identity:</Text>
        <Text style={codeStyle}>{token}</Text>
        <Text style={footer}>
          This code will expire shortly. If you didn't request this, you can
          safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail

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
const main = { backgroundColor: '#ffffff', fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif' }
const container = { padding: '32px 28px', maxWidth: '600px' }
const h1 = {
  fontSize: '24px',
  fontWeight: 'bold' as const,
  color: '#0F0F0F',
  margin: '0 0 16px',
  lineHeight: '1.25',
}
const text = {
  fontSize: '15px',
  color: '#3F3F3F',
  lineHeight: '1.6',
  margin: '0 0 20px',
}
const codeStyle = {
  fontFamily: 'Courier, monospace',
  fontSize: '28px',
  fontWeight: 'bold' as const,
  color: '#0F0F0F',
  letterSpacing: '0.15em',
  backgroundColor: '#FAF8F2',
  border: '1px solid #EDE6CF',
  borderRadius: '6px',
  padding: '14px 20px',
  textAlign: 'center' as const,
  margin: '0 0 30px',
}
const footer = {
  fontSize: '12px',
  color: '#7A7A7A',
  lineHeight: '1.6',
  margin: '36px 0 0',
  borderTop: '1px solid #EAEAEA',
  paddingTop: '20px',
}
