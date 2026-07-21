/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import {
  BRAND_NAME, accentBar, brand, button, callout, container,
  footer, h1, h2, main, muted, subBrand, text, unmonitoredNotice,
} from './_pei-shared.ts'

interface Props {
  driverName?: string
  unitNumber?: string
  responseUrl?: string
}

const PassengerAuthRequestEmail = ({ driverName, unitNumber, responseUrl }: Props) => {
  const name = driverName || 'Driver'
  const unit = unitNumber || '—'
  const url = responseUrl || 'https://mysupertransport.lovable.app/passenger-auth/SAMPLE-TOKEN'
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>Complete your Passenger Authorization for {BRAND_NAME}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={brand}>{BRAND_NAME}</Heading>
          <Text style={subBrand}>SAFETY — PASSENGER AUTHORIZATION</Text>
          <div style={accentBar} />
          <Heading style={h1}>Passenger Authorization Request</Heading>
          <Text style={text}>Hi {name},</Text>
          <Text style={text}>
            Before you can carry a non-employee passenger in your truck (Unit
            <strong> {unit}</strong>), federal regulations require a signed
            passenger authorization on file. Please tap the button below to
            complete the <strong>Passenger Authorization</strong> and sign the
            form. Your passenger will also need to sign it before it becomes
            effective.
          </Text>
          <div style={{ textAlign: 'center' as const, margin: '24px 0' }}>
            <Button style={button} href={url}>
              Complete Passenger Authorization →
            </Button>
          </div>
          <Heading style={h2}>What you&rsquo;ll need</Heading>
          <Text style={muted}>
            • The full legal name of the passenger<br />
            • Their relationship to you and date of birth<br />
            • The effective start date<br />
            • A short digital signature from you (and the passenger)
          </Text>
          <div style={callout}>
            Once fully signed, {BRAND_NAME} will countersign and file the
            executed authorization to your Driver Hub. You&rsquo;ll receive a
            copy for your records.
          </div>
          <div style={unmonitoredNotice}>
            📭 This inbox is not monitored. Reach out to your onboarding
            contact if you have questions.
          </div>
          <Text style={footer}>— {BRAND_NAME} Safety</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: PassengerAuthRequestEmail,
  subject: (d: Record<string, any>) =>
    `Action needed: Passenger Authorization for Unit ${d?.unitNumber || ''}`.trim(),
  displayName: 'Passenger Authorization Request',
  previewData: {
    driverName: 'James Whitaker',
    unitNumber: '204',
    responseUrl: 'https://mysupertransport.lovable.app/passenger-auth/SAMPLE-TOKEN',
  },
} satisfies TemplateEntry