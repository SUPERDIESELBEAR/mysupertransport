/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import {
  BRAND_NAME, accentBar, brand, button, container, factCell, factLabel,
  factTable, footer, h1, h2, main, subBrand, text, warningCallout,
  type PEIEmailProps,
} from './_pei-shared.ts'

const PEIRequestFinalNoticeEmail = (props: PEIEmailProps) => {
  const applicant = props.applicantName || 'the applicant named below'
  const employer = props.employerName || 'your company'
  const contact = props.contactName
  const start = props.employmentStartDate || '—'
  const end = props.employmentEndDate || '—'
  const url = props.responseUrl || 'https://mysupertransport.lovable.app/pei/respond/SAMPLE-TOKEN'
  const days = typeof props.daysRemaining === 'number' ? props.daysRemaining : 5

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>
        Final notice — PEI response needed for {applicant}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={brand}>{BRAND_NAME}</Heading>
          <Text style={subBrand}>COMPLIANCE — FINAL NOTICE</Text>
          <div style={accentBar} />

          <Heading style={h1}>Final notice — Good Faith Effort pending</Heading>
          <Text style={text}>{contact ? `Dear ${contact},` : `To Whom It May Concern,`}</Text>
          <Text style={text}>
            This is our <strong>final outreach</strong> regarding{' '}
            <strong>{applicant}</strong>&rsquo;s Previous Employer
            Investigation. We have attempted to reach you twice without a
            response.
          </Text>

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
                <td style={{ ...factLabel, borderBottom: 'none' }}>
                  Employment dates
                </td>
                <td style={{ ...factCell, borderBottom: 'none' }}>
                  {start} – {end}
                </td>
              </tr>
            </tbody>
          </table>

          <div style={warningCallout}>
            <strong>If we do not receive a response within {Math.max(days, 0)} days,</strong>{' '}
            we will document a <strong>Good Faith Effort</strong> under{' '}
            49 CFR §391.23(c)(2) and proceed with the applicant&rsquo;s
            qualification file based on the information available. This
            outreach and your non-response will be retained as part of the
            permanent driver qualification record.
          </div>

          <Heading style={h2}>You can still respond now</Heading>
          <Text style={text}>
            Use the secure link below to complete the investigation. It only
            takes a few minutes.
          </Text>
          <Button style={button} href={url}>
            Complete the investigation →
          </Button>

          <Text style={footer}>
            If you have already responded, please disregard this notice. If
            you cannot provide the information (records purged, no longer in
            business, etc.), reply to this email and we will document
            accordingly.
            <br />— {BRAND_NAME} Compliance
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: PEIRequestFinalNoticeEmail,
  subject: (data: Record<string, any>) =>
    `FINAL NOTICE: PEI response required — ${data?.applicantName || 'Driver applicant'}`,
  displayName: 'PEI Request — Final Notice (Day 25)',
  previewData: {
    applicantName: 'James Whitaker',
    employerName: 'Acme Trucking LLC',
    contactName: 'Safety Manager',
    employmentStartDate: '03/2021',
    employmentEndDate: '08/2024',
    responseUrl: 'https://mysupertransport.lovable.app/pei/respond/SAMPLE-TOKEN',
    daysRemaining: 5,
  },
} satisfies TemplateEntry