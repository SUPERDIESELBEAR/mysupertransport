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
  recipientName?: string
  reviewUrl?: string
  note?: string
  expiresOn?: string
}

const IcaReviewCopyEmail = ({ recipientName, reviewUrl, note, expiresOn }: Props) => {
  const name = recipientName || 'there'
  const url = reviewUrl || 'https://mysupertransport.lovable.app/ica/review/SAMPLE-TOKEN'
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>Your review copy of the {BRAND_NAME} Independent Contractor Agreement</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={brand}>{BRAND_NAME}</Heading>
          <Text style={subBrand}>CONTRACTS — REVIEW COPY</Text>
          <div style={accentBar} />
          <Heading style={h1}>Independent Contractor Agreement</Heading>
          <Text style={text}>Hi {name},</Text>
          <Text style={text}>
            As requested, here is a copy of the {BRAND_NAME} <strong>Independent
            Contractor Agreement</strong> for your review. Open the link below to
            read the full agreement in your browser, or download it as a PDF.
          </Text>
          <div style={{ textAlign: 'center' as const, margin: '24px 0' }}>
            <Button style={button} href={url}>
              Open Review Copy →
            </Button>
          </div>
          {note ? (
            <div style={callout}>
              <strong>Note from our team:</strong><br />{note}
            </div>
          ) : null}
          <Heading style={h2}>Please note</Heading>
          <Text style={muted}>
            • This is a <strong>review copy only</strong> — every page is watermarked and no signature is collected here.<br />
            • Your final agreement is prepared with your own equipment, pay, and business details during onboarding.<br />
            {expiresOn ? <>• This link expires on <strong>{expiresOn}</strong>.<br /></> : null}
          </Text>
          <div style={unmonitoredNotice}>
            📭 This inbox is not monitored. Reply to your recruiting or onboarding
            contact with any questions about the agreement.
          </div>
          <Text style={footer}>{BRAND_NAME} · PO Box 4, Pleasant Hill, MO 64080</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: IcaReviewCopyEmail,
  subject: `Your review copy — ${BRAND_NAME} Independent Contractor Agreement`,
  displayName: 'ICA Review Copy',
  previewData: {
    recipientName: 'John Smith',
    reviewUrl: 'https://mysupertransport.lovable.app/ica/review/SAMPLE-TOKEN',
    note: 'Take your time — happy to walk through any section on a call.',
    expiresOn: 'September 16, 2026',
  },
} satisfies TemplateEntry