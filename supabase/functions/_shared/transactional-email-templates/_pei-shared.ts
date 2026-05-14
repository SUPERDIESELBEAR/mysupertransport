// Shared brand styles for PEI emails — mirrors the SUPERTRANSPORT visual identity
// used in src/components/management/EmailCatalog.tsx and the auth templates.

export const BRAND_NAME = 'SUPERTRANSPORT'
export const BRAND_GOLD = '#C9A84C'
export const BRAND_DARK = '#0F0F0F'

export const main = {
  backgroundColor: '#ffffff',
  fontFamily:
    'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif',
}
export const container = { padding: '32px 28px', maxWidth: '640px' }
export const brand = {
  fontSize: '14px',
  fontWeight: 'bold' as const,
  color: BRAND_DARK,
  letterSpacing: '0.18em',
  margin: '0 0 12px',
}
export const subBrand = {
  fontSize: '11px',
  color: '#7A7A7A',
  letterSpacing: '0.14em',
  margin: '0 0 18px',
}
export const accentBar = {
  width: '48px',
  height: '3px',
  backgroundColor: BRAND_GOLD,
  margin: '0 0 24px',
}
export const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: BRAND_DARK,
  margin: '0 0 8px',
  lineHeight: '1.3',
}
export const h2 = {
  fontSize: '15px',
  fontWeight: 'bold' as const,
  color: BRAND_DARK,
  margin: '24px 0 8px',
}
export const text = {
  fontSize: '14px',
  color: '#3F3F3F',
  lineHeight: '1.6',
  margin: '0 0 14px',
}
export const muted = {
  fontSize: '12px',
  color: '#7A7A7A',
  lineHeight: '1.5',
  margin: '0 0 12px',
}
export const factTable = {
  width: '100%',
  borderCollapse: 'separate' as const,
  margin: '8px 0 16px',
  backgroundColor: '#FAF8F2',
  border: '1px solid #EDE6CF',
  borderRadius: '6px',
}
export const factCell = {
  padding: '10px 14px',
  fontSize: '13px',
  color: BRAND_DARK,
  borderBottom: '1px solid #EDE6CF',
}
export const factLabel = {
  ...factCell,
  fontWeight: 'bold' as const,
  width: '40%',
  color: '#5A4A1F',
}
export const button = {
  backgroundColor: BRAND_GOLD,
  color: BRAND_DARK,
  fontSize: '15px',
  fontWeight: 'bold' as const,
  borderRadius: '6px',
  padding: '14px 26px',
  textDecoration: 'none',
  display: 'inline-block',
  margin: '8px 0 4px',
}
export const callout = {
  backgroundColor: '#FFF7E6',
  border: '1px solid #F0D78C',
  borderLeft: `4px solid ${BRAND_GOLD}`,
  borderRadius: '4px',
  padding: '12px 16px',
  margin: '16px 0',
  fontSize: '13px',
  color: BRAND_DARK,
  lineHeight: '1.55',
}
export const warningCallout = {
  ...callout,
  backgroundColor: '#FFF1F0',
  borderColor: '#F5C6C2',
  borderLeftColor: '#C8341E',
}
export const unmonitoredNotice = {
  fontSize: '12px',
  color: '#7A7A7A',
  lineHeight: '1.5',
  margin: '10px 0 18px',
  padding: '10px 14px',
  backgroundColor: '#F7F7F5',
  border: '1px solid #EAEAEA',
  borderRadius: '4px',
}
export const footer = {
  fontSize: '12px',
  color: '#7A7A7A',
  lineHeight: '1.6',
  margin: '36px 0 0',
  borderTop: '1px solid #EAEAEA',
  paddingTop: '20px',
}

export interface PEIEmailProps {
  applicantName?: string
  employerName?: string
  contactName?: string
  employmentStartDate?: string
  employmentEndDate?: string
  responseUrl?: string
  deadlineDate?: string
  daysRemaining?: number
}

export function buildResponseUrl(
  baseSiteUrl: string | undefined,
  token: string | undefined,
): string {
  const site = (baseSiteUrl || 'https://mysupertransport.lovable.app').replace(/\/$/, '')
  return token ? `${site}/pei/respond/${token}` : `${site}/pei/respond/SAMPLE-TOKEN`
}