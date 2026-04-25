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

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({
  siteName,
  siteUrl,
  recipient,
  confirmationUrl,
}: SignupEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Confirm your email for {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
                <Heading style={brand}>SUPERTRANSPORT</Heading>
        <div style={accentBar} />
        <Heading style={h1}>Confirm your email</Heading>
        <Text style={text}>
          Thanks for signing up for{' '}
          <Link href={siteUrl} style={link}>
            <strong>{siteName}</strong>
          </Link>
          !
        </Text>
        <Text style={text}>
          Please confirm your email address (
          <Link href={`mailto:${recipient}`} style={link}>
            {recipient}
          </Link>
          ) by clicking the button below:
        </Text>
        <Button style={button} href={confirmationUrl}>
          Verify Email
        </Button>
        <Text style={footer}>
          If you didn't create an account, you can safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail

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
const footer = {
  fontSize: '12px',
  color: '#7A7A7A',
  lineHeight: '1.6',
  margin: '36px 0 0',
  borderTop: '1px solid #EAEAEA',
  paddingTop: '20px',
}
