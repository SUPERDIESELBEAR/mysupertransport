/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  to?: string
  displayName?: string
  previewData?: Record<string, any>
}

import { template as peiRequestInitial } from './pei-request-initial.tsx'
import { template as peiRequestFollowUp } from './pei-request-follow-up.tsx'
import { template as peiRequestFinalNotice } from './pei-request-final-notice.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'pei-request-initial': peiRequestInitial,
  'pei-request-follow-up': peiRequestFollowUp,
  'pei-request-final-notice': peiRequestFinalNotice,
}