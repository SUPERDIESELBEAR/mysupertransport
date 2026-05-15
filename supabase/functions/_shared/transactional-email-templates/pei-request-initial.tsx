/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import {
  BRAND_NAME, accentBar, brand, button, callout, container, factCell,
  factLabel, factTable, footer, h1, h2, main, muted, secondaryButton, subBrand, text, unmonitoredNotice,
  type PEIEmailProps,
} from './_pei-shared.ts'

const PEIRequestInitialEmail = (props: PEIEmailProps) => {
  const applicant = props.applicantName || 'the applicant named below'
  const employer = props.employerName || 'your company'
  const contact = props.contactName
  const start = props.employmentStartDate || '—'
  const end = props.employmentEndDate || '—'
  const url = props.responseUrl || 'https://mysupertransport.lovable.app/pei/respond/SAMPLE-TOKEN'
  const deadline = props.deadlineDate || 'within 30 days of receipt'
  const releaseUrl = props.releaseUrl

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>
        FMCSA Previous Employer Investigation request — {applicant}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={brand}>{BRAND_NAME}</Heading>
          <Text style={subBrand}>COMPLIANCE — DRIVER QUALIFICATION</Text>
          <div style={accentBar} />

          <Heading style={h1}>
            Previous Employer Investigation Request
          </Heading>
          <Text style={text}>
            {contact ? `Dear ${contact},` : `To Whom It May Concern,`}
          </Text>
          <Text style={text}>
            <strong>{applicant}</strong> has applied for a commercial driving
            position with <strong>{BRAND_NAME}</strong> and has listed{' '}
            <strong>{employer}</strong> as a previous DOT-regulated employer.
            Federal regulations <strong>49 CFR §391.23</strong> require us to
            investigate the applicant&rsquo;s safety performance history with
            each DOT-regulated employer over the past three years.
          </Text>

          <div style={callout}>
            <strong>Wrong recipient?</strong> If PEI verifications are now
            handled by someone else at {employer}, please forward this email
            to the correct person in your office. The applicant may have
            provided contact info that is several years old.
          </div>

          <Heading style={h2}>Employment claimed by applicant</Heading>
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
                <td style={factLabel}>Start date</td>
                <td style={factCell}>{start}</td>
              </tr>
              <tr>
                <td style={{ ...factLabel, borderBottom: 'none' }}>End date</td>
                <td style={{ ...factCell, borderBottom: 'none' }}>{end}</td>
              </tr>
            </tbody>
          </table>

          <Heading style={h2}>Please respond securely online</Heading>
          <Text style={text}>
            Click the button below to complete the investigation form. The
            response link is unique to this request and the applicant has
            signed a release authorizing you to share this information.
          </Text>
          <Button style={button} href={url}>
            Complete the investigation →
          </Button>
          {releaseUrl ? (
            <>
              <br />
              <Button style={secondaryButton} href={releaseUrl}>
                📄 View the signed FCRA authorization
              </Button>
              <Text style={muted}>
                The applicant signed a Fair Credit Reporting Act release
                authorizing you to share this employment information with{' '}
                {BRAND_NAME}. Click above to view the signed document.
              </Text>
            </>
          ) : null}
          <div style={unmonitoredNotice}>
            📭 This inbox is not monitored. Please use the secure response
            button above to submit your verification.
          </div>

          <div style={callout}>
            <strong>Response requested:</strong> {deadline}.<br />
            We are required to attempt this contact at least twice before
            documenting a Good Faith Effort, so a prompt response avoids
            follow-up notices.
          </div>

          <Heading style={h2}>What we ask about</Heading>
          <Text style={muted}>
            Dates of employment, equipment operated, accident history,
            drug &amp; alcohol testing history (per §40.25), and overall
            safety performance. Responses are kept confidential and used
            solely for driver qualification under §391.
          </Text>

          <Text style={footer}>
            — {BRAND_NAME} Compliance
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: PEIRequestInitialEmail,
  subject: (data: Record<string, any>) =>
    `FMCSA Previous Employer Verification — ${data?.applicantName || 'Driver applicant'}`,
  displayName: 'PEI Request — Initial',
  previewData: {
    applicantName: 'James Whitaker',
    employerName: 'Acme Trucking LLC',
    contactName: 'Safety Manager',
    employmentStartDate: '03/2021',
    employmentEndDate: '08/2024',
    responseUrl: 'https://mysupertransport.lovable.app/pei/respond/SAMPLE-TOKEN',
    releaseUrl: 'https://mysupertransport.lovable.app/pei/release/SAMPLE-TOKEN',
    deadlineDate: 'within 30 days of receipt',
  },
} satisfies TemplateEntry