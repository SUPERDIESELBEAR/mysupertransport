/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import {
  BRAND_NAME, accentBar, brand, button, callout, container, factCell,
  factLabel, factTable, footer, h1, h2, main, subBrand, text, unmonitoredNotice,
  type PEIEmailProps,
} from './_pei-shared.ts'

const PEIRequestFollowUpEmail = (props: PEIEmailProps) => {
  const applicant = props.applicantName || 'the applicant named below'
  const employer = props.employerName || 'your company'
  const contact = props.contactName
  const start = props.employmentStartDate || '—'
  const end = props.employmentEndDate || '—'
  const url = props.responseUrl || 'https://mysupertransport.lovable.app/pei/respond/SAMPLE-TOKEN'
  const days = typeof props.daysRemaining === 'number' ? props.daysRemaining : 15

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>
        Reminder: PEI response needed for {applicant}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={brand}>{BRAND_NAME}</Heading>
          <Text style={subBrand}>COMPLIANCE — FOLLOW-UP NOTICE</Text>
          <div style={accentBar} />

          <Heading style={h1}>Friendly reminder — PEI response needed</Heading>
          <Text style={text}>{contact ? `Dear ${contact},` : `To Whom It May Concern,`}</Text>
          <Text style={text}>
            We previously contacted you regarding{' '}
            <strong>{applicant}</strong>&rsquo;s application for a commercial
            driving position with <strong>{BRAND_NAME}</strong>. We have not
            yet received your Previous Employer Investigation response, which
            is required by <strong>49 CFR §391.23</strong>.
          </Text>

          <div style={callout}>
            <strong>Wrong recipient?</strong> If PEI verifications are now
            handled by someone else at {employer}, please forward this email
            to the correct person in your office. The applicant may have
            provided contact info that is several years old.
          </div>

          <table style={factTable} cellPadding={0} cellSpacing={0}>
            <tbody>
              <tr>
                <td style={factLabel}>Driver name</td>
                <td style={factCell}>{applicant}</td>
              </tr>
              <tr>
                <td style={factLabel}>Employer</td>
                <td style={factCell}>{employer}</td>
              </tr>
              <tr>
                <td style={factLabel}>Employment dates</td>
                <td style={factCell}>{start} – {end}</td>
              </tr>
              <tr>
                <td style={{ ...factLabel, borderBottom: 'none' }}>
                  Days remaining
                </td>
                <td style={{ ...factCell, borderBottom: 'none' }}>
                  <strong>{Math.max(days, 0)}</strong>
                </td>
              </tr>
            </tbody>
          </table>

          <Button style={button} href={url}>
            Complete the investigation →
          </Button>
          <div style={unmonitoredNotice}>
            📭 This inbox is not monitored. Please use the secure response
            button above to submit your verification.
          </div>

          <div style={callout}>
            Your prompt response keeps this driver&rsquo;s qualification on
            track and helps us meet our federal obligations. The applicant has
            already signed a release authorizing you to share this information.
          </div>

          <Text style={footer}>
            — {BRAND_NAME} Compliance
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: PEIRequestFollowUpEmail,
  subject: (data: Record<string, any>) =>
    `Reminder: PEI response needed — ${data?.applicantName || 'Driver applicant'}`,
  displayName: 'PEI Request — Follow-Up (Day 15)',
  previewData: {
    applicantName: 'James Whitaker',
    employerName: 'Acme Trucking LLC',
    contactName: 'Safety Manager',
    employmentStartDate: '03/2021',
    employmentEndDate: '08/2024',
    responseUrl: 'https://mysupertransport.lovable.app/pei/respond/SAMPLE-TOKEN',
    daysRemaining: 15,
  },
} satisfies TemplateEntry