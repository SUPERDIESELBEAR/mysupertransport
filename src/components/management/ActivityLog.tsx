import { useState, useEffect, useCallback, useRef } from 'react';
import { format, startOfDay, endOfDay, startOfToday, endOfToday, subDays, startOfMonth, endOfMonth } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle2, XCircle, UserPlus, UserMinus, Shield, FileText,
  Milestone, RefreshCcw, Activity, ChevronDown, ChevronRight, Download, CalendarIcon, X,
  User, Tag, Hash, Clock, StickyNote, Settings2, Info, Search, ExternalLink, Phone, Upload, MailPlus, Mail, UserCheck, FilePen, RotateCcw, AlertTriangle, Check, FileSearch
} from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-status-progress/15 text-status-progress border-status-progress/30',
  approved: 'bg-status-complete/15 text-status-complete border-status-complete/30',
  denied: 'bg-destructive/15 text-destructive border-destructive/30',
  revisions_requested: 'bg-status-progress/15 text-status-progress border-status-progress/30',
};

interface AuditEntry {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

const ACTION_CONFIG: Record<string, {
  label: string;
  icon: React.ReactNode;
  color: string;
  bg: string;
}> = {
  application_approved: {
    label: 'Application Approved',
    icon: <CheckCircle2 className="h-4 w-4" />,
    color: 'text-status-complete',
    bg: 'bg-status-complete/10 border-status-complete/20',
  },
  application_denied: {
    label: 'Application Denied',
    icon: <XCircle className="h-4 w-4" />,
    color: 'text-destructive',
    bg: 'bg-destructive/10 border-destructive/20',
  },
  role_added: {
    label: 'Role Granted',
    icon: <UserPlus className="h-4 w-4" />,
    color: 'text-gold',
    bg: 'bg-gold/10 border-gold/20',
  },
  role_removed: {
    label: 'Role Revoked',
    icon: <UserMinus className="h-4 w-4" />,
    color: 'text-muted-foreground',
    bg: 'bg-muted border-border',
  },
  onboarding_milestone: {
    label: 'Onboarding Milestone',
    icon: <Milestone className="h-4 w-4" />,
    color: 'text-gold',
    bg: 'bg-gold/10 border-gold/20',
  },
  operator_status_updated: {
    label: 'Onboarding Updated',
    icon: <FileText className="h-4 w-4" />,
    color: 'text-blue-600',
    bg: 'bg-blue-50 border-blue-200',
  },
  phone_updated: {
    label: 'Phone Updated',
    icon: <Phone className="h-4 w-4" />,
    color: 'text-violet-600',
    bg: 'bg-violet-50 border-violet-200',
  },
  document_uploaded: {
    label: 'Document Uploaded',
    icon: <Upload className="h-4 w-4" />,
    color: 'text-teal-600',
    bg: 'bg-teal-50 border-teal-200',
  },
  staff_invited: {
    label: 'Staff Invited',
    icon: <MailPlus className="h-4 w-4" />,
    color: 'text-indigo-600',
    bg: 'bg-indigo-50 border-indigo-200',
  },
  operator_invited: {
    label: 'Operator Invited',
    icon: <UserCheck className="h-4 w-4" />,
    color: 'text-cyan-600',
    bg: 'bg-cyan-50 border-cyan-200',
  },
  ica_issued: {
    label: 'ICA Issued',
    icon: <FilePen className="h-4 w-4" />,
    color: 'text-amber-600',
    bg: 'bg-amber-50 border-amber-200',
  },
  ica_signed: {
    label: 'ICA Signed',
    icon: <CheckCircle2 className="h-4 w-4" />,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50 border-emerald-200',
  },
  onboarding_completed: {
    label: 'Onboarding Completed',
    icon: <CheckCircle2 className="h-4 w-4" />,
    color: 'text-emerald-700',
    bg: 'bg-emerald-100 border-emerald-300',
  },
  cert_renewed: {
    label: 'Certificate Renewed',
    icon: <RotateCcw className="h-4 w-4" />,
    color: 'text-status-complete',
    bg: 'bg-status-complete/10 border-status-complete/20',
  },
  expiry_updated: {
    label: 'Expiry Updated',
    icon: <CalendarIcon className="h-4 w-4" />,
    color: 'text-sky-600',
    bg: 'bg-sky-50 border-sky-200',
  },
  insurance_fields_updated: {
    label: 'Insurance Updated',
    icon: <Shield className="h-4 w-4" />,
    color: 'text-amber-600',
    bg: 'bg-amber-50 border-amber-200',
  },
  go_live_updated: {
    label: 'Go-Live Set',
    icon: <CheckCircle2 className="h-4 w-4" />,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50 border-emerald-200',
  },
  exception_approved: {
    label: 'Exception Approved',
    icon: <AlertTriangle className="h-4 w-4" />,
    color: 'text-amber-600',
    bg: 'bg-amber-50 border-amber-200',
  },
  revision_request_reverted: {
    label: 'Revision Request Reverted',
    icon: <RotateCcw className="h-4 w-4" />,
    color: 'text-amber-700',
    bg: 'bg-amber-100 border-amber-300',
  },
};

const FILTER_OPTIONS = [
  { value: 'all', label: 'All Actions' },
  { value: 'application_approved', label: 'Approved' },
  { value: 'application_denied', label: 'Denied' },
  { value: 'role_added', label: 'Roles Granted' },
  { value: 'role_removed', label: 'Roles Revoked' },
  { value: 'operator_status_updated', label: 'Onboarding Updates' },
  { value: 'phone_updated', label: 'Phone Updates' },
  { value: 'document_uploaded', label: 'Document Uploads' },
  { value: 'staff_invited', label: 'Staff Invitations' },
  { value: 'operator_invited', label: 'Operator Invitations' },
  { value: 'ica_issued', label: 'ICA Issued' },
  { value: 'ica_signed', label: 'ICA Signed' },
  { value: 'onboarding_completed', label: 'Onboarding Completed' },
  { value: 'cert_renewed', label: 'Cert Renewals' },
  { value: 'expiry_updated', label: 'Fleet Expiry Updates' },
  { value: 'insurance_fields_updated', label: 'Insurance Updates' },
  { value: 'go_live_updated', label: 'Go-Live Set' },
  { value: 'exception_approved', label: 'Exceptions Approved' },
  { value: 'revision_request_reverted', label: 'Revision Reverted' },
];

const DATE_PRESETS = [
  {
    label: 'Today',
    getRange: () => ({ from: startOfToday(), to: endOfToday() }),
  },
  {
    label: 'Last 7 days',
    getRange: () => ({ from: startOfDay(subDays(new Date(), 6)), to: endOfToday() }),
  },
  {
    label: 'Last 30 days',
    getRange: () => ({ from: startOfDay(subDays(new Date(), 29)), to: endOfToday() }),
  },
  {
    label: 'This month',
    getRange: () => ({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) }),
  },
];

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function formatRole(role: string): string {
  return role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function EntryDetail({ entry, currentStatuses }: { entry: AuditEntry; currentStatuses?: Record<string, string> }) {
  const meta = entry.metadata ?? {};
  switch (entry.action) {
    case 'application_approved':
    case 'application_denied':
      return (
        <span className="text-xs text-muted-foreground">
          {meta.applicant_email as string}
          {meta.reviewer_notes ? ` · "${meta.reviewer_notes as string}"` : ''}
        </span>
      );
    case 'role_added':
    case 'role_removed':
      return (
        <span className="text-xs text-muted-foreground">
          {entry.action === 'role_added' ? 'Granted' : 'Revoked'}{' '}
          <span className="font-medium text-foreground">{formatRole(meta.role as string)}</span>
          {' '}role
        </span>
      );
    case 'operator_status_updated':
      return (
        <span className="text-xs text-muted-foreground">
          {(meta.milestones as string[])?.join(', ') ?? 'Status updated'}
        </span>
      );
    case 'cert_renewed':
      return (
        <span className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{meta.document_type as string}</span>
          {' '}renewed for{' '}
          <span className="font-medium text-foreground">{meta.operator_name as string}</span>
          {meta.old_expiry ? ` · was ${new Date((meta.old_expiry as string) + 'T00:00:00').toLocaleDateString()}` : ''}
        </span>
      );
    case 'expiry_updated':
      return (
        <span className="text-xs text-muted-foreground">
          Fleet <span className="font-medium text-foreground">{meta.document_type as string}</span>
          {meta.old_expiry ? ` · ${new Date((meta.old_expiry as string) + 'T00:00:00').toLocaleDateString()} → ` : ' updated to '}
          <span className="font-medium text-foreground">{meta.new_expiry ? new Date((meta.new_expiry as string) + 'T00:00:00').toLocaleDateString() : ''}</span>
        </span>
      );
    case 'insurance_fields_updated': {
      const changes = meta.changes as Record<string, { from: unknown; to: unknown }> | undefined;
      const fieldNames = changes ? Object.keys(changes) : [];
      return (
        <span className="text-xs text-muted-foreground">
          {fieldNames.length > 0
            ? <>{fieldNames.length} field{fieldNames.length > 1 ? 's' : ''} updated: <span className="font-medium text-foreground">{fieldNames.slice(0, 3).join(', ')}{fieldNames.length > 3 ? ` +${fieldNames.length - 3} more` : ''}</span></>
            : 'Insurance fields updated'}
        </span>
      );
    }
    case 'revision_request_reverted': {
      const currentStatus = entry.entity_id ? currentStatuses?.[entry.entity_id] : undefined;
      return (
        <span className="text-xs text-muted-foreground">
          Restored to <span className="font-medium text-foreground">{formatRole(meta.restored_status as string)}</span>
          {meta.invalidated_tokens ? ` · ${meta.invalidated_tokens} token(s) invalidated` : ''}
          {currentStatus && (
            <span className="inline-flex items-center gap-1.5 ml-2">
              Now:
              <Badge className={`text-[10px] px-1.5 py-0 border ${STATUS_COLORS[currentStatus] ?? 'bg-muted text-muted-foreground border-border'}`}>
                {currentStatus}
              </Badge>
            </span>
          )}
        </span>
      );
    }
    default:
      return null;
  }
}

// ── Expanded detail panel ─────────────────────────────────────────────────────

function MetaRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex items-start gap-2.5 py-2 border-b border-border/50 last:border-0">
      <span className="text-muted-foreground/60 mt-0.5 shrink-0">{icon}</span>
      <span className="text-xs text-muted-foreground w-28 shrink-0 font-medium">{label}</span>
      <span className="text-xs text-foreground break-all">{value}</span>
    </div>
  );
}

type DeepLinkAction =
  | { type: 'operator'; operatorId: string }
  | { type: 'application'; applicationId: string }
  | { type: 'staff' };

function EntryExpandedPanel({
  entry,
  onNavigate,
}: {
  entry: AuditEntry;
  onNavigate?: (action: DeepLinkAction) => void;
}) {
  const meta = entry.metadata ?? {};

  // Resolve deep-link target
  const deepLink: DeepLinkAction | null = (() => {
    if (entry.entity_type === 'operator' && entry.entity_id) {
      return { type: 'operator', operatorId: entry.entity_id };
    }
    if (entry.entity_type === 'application' && entry.entity_id) {
      return { type: 'application', applicationId: entry.entity_id };
    }
    if (entry.entity_type === 'staff_profile') {
      return { type: 'staff' };
    }
    // role events targeting a staff user
    if ((entry.action === 'role_added' || entry.action === 'role_removed') && entry.entity_type !== 'operator') {
      return { type: 'staff' };
    }
    return null;
  })();

  // Build action-specific structured fields
  const structuredRows: { icon: React.ReactNode; label: string; value: React.ReactNode }[] = [];

  if (entry.actor_name) {
    structuredRows.push({ icon: <User className="h-3.5 w-3.5" />, label: 'Actor', value: entry.actor_name });
  }
  if (entry.actor_id) {
    structuredRows.push({ icon: <Hash className="h-3.5 w-3.5" />, label: 'Actor ID', value: <span className="font-mono text-[10px]">{entry.actor_id}</span> });
  }
  if (entry.entity_label) {
    structuredRows.push({ icon: <Tag className="h-3.5 w-3.5" />, label: 'Subject', value: entry.entity_label });
  }
  if (entry.entity_id) {
    structuredRows.push({ icon: <Hash className="h-3.5 w-3.5" />, label: 'Subject ID', value: <span className="font-mono text-[10px]">{entry.entity_id}</span> });
  }
  structuredRows.push({ icon: <Tag className="h-3.5 w-3.5" />, label: 'Entity Type', value: entry.entity_type });
  structuredRows.push({
    icon: <Clock className="h-3.5 w-3.5" />,
    label: 'Timestamp',
    value: new Date(entry.created_at).toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'medium' })
  });

  // Action-specific metadata
  switch (entry.action) {
    case 'application_approved':
    case 'application_denied':
      if (meta.applicant_name) structuredRows.push({ icon: <User className="h-3.5 w-3.5" />, label: 'Applicant', value: meta.applicant_name as string });
      if (meta.applicant_email) structuredRows.push({ icon: <Info className="h-3.5 w-3.5" />, label: 'Email', value: meta.applicant_email as string });
      if (meta.reviewer_notes) structuredRows.push({ icon: <StickyNote className="h-3.5 w-3.5" />, label: 'Reviewer Notes', value: <span className="italic">"{meta.reviewer_notes as string}"</span> });
      break;
    case 'role_added':
    case 'role_removed':
      if (meta.role) structuredRows.push({ icon: <Shield className="h-3.5 w-3.5" />, label: 'Role', value: formatRole(meta.role as string) });
      if (meta.target_user) structuredRows.push({ icon: <User className="h-3.5 w-3.5" />, label: 'Target User', value: meta.target_user as string });
      break;
    case 'operator_status_updated':
    case 'onboarding_milestone': {
      const milestones = meta.milestones as string[] | undefined;
      if (milestones?.length) {
        structuredRows.push({
          icon: <Milestone className="h-3.5 w-3.5" />,
          label: 'Milestones',
          value: (
            <span className="flex flex-col gap-0.5">
              {milestones.map((m, i) => <span key={i} className="inline-block">{m}</span>)}
            </span>
          )
        });
      }
      const changedFields = meta.changed_fields as Record<string, unknown> | undefined;
      if (changedFields) {
        Object.entries(changedFields).forEach(([k, v]) => {
          structuredRows.push({
            icon: <Settings2 className="h-3.5 w-3.5" />,
            label: k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
            value: String(v),
          });
        });
      }
      break;
    }
    case 'cert_renewed':
      if (meta.operator_name) structuredRows.push({ icon: <User className="h-3.5 w-3.5" />, label: 'Operator', value: meta.operator_name as string });
      if (meta.document_type) structuredRows.push({ icon: <RotateCcw className="h-3.5 w-3.5" />, label: 'Document', value: meta.document_type as string });
      if (meta.old_expiry) structuredRows.push({ icon: <Clock className="h-3.5 w-3.5" />, label: 'Previous Expiry', value: new Date((meta.old_expiry as string) + 'T00:00:00').toLocaleDateString() });
      if (meta.new_expiry) structuredRows.push({ icon: <CheckCircle2 className="h-3.5 w-3.5" />, label: 'New Expiry', value: new Date((meta.new_expiry as string) + 'T00:00:00').toLocaleDateString() });
      break;
    case 'expiry_updated':
      if (meta.document_type) structuredRows.push({ icon: <CalendarIcon className="h-3.5 w-3.5" />, label: 'Document Type', value: meta.document_type as string });
      if (meta.old_expiry) structuredRows.push({ icon: <Clock className="h-3.5 w-3.5" />, label: 'Previous Expiry', value: new Date((meta.old_expiry as string) + 'T00:00:00').toLocaleDateString() });
      if (meta.new_expiry) structuredRows.push({ icon: <CheckCircle2 className="h-3.5 w-3.5" />, label: 'New Expiry', value: new Date((meta.new_expiry as string) + 'T00:00:00').toLocaleDateString() });
      if (meta.urgency) structuredRows.push({ icon: <Info className="h-3.5 w-3.5" />, label: 'Urgency', value: String(meta.urgency) });
      break;
    case 'insurance_fields_updated': {
      const changes = meta.changes as Record<string, { from: unknown; to: unknown }> | undefined;
      if (changes) {
        Object.entries(changes).forEach(([field, diff]) => {
          const from = diff.from != null ? String(diff.from) : '—';
          const to   = diff.to   != null ? String(diff.to)   : '—';
          structuredRows.push({
            icon: <Shield className="h-3.5 w-3.5" />,
            label: field,
            value: <span>{from} → <span className="font-medium text-foreground">{to}</span></span>,
          });
        });
      }
      break;
    }
    case 'revision_request_reverted': {
      if (meta.restored_status) structuredRows.push({ icon: <RotateCcw className="h-3.5 w-3.5" />, label: 'Restored Status', value: formatRole(meta.restored_status as string) });
      if (meta.invalidated_tokens != null) structuredRows.push({ icon: <Hash className="h-3.5 w-3.5" />, label: 'Tokens Invalidated', value: String(meta.invalidated_tokens) });
      if (meta.courtesy_email_sent != null) structuredRows.push({ icon: <Mail className="h-3.5 w-3.5" />, label: 'Courtesy Email', value: meta.courtesy_email_sent ? 'Sent' : 'Not sent' });
      if (meta.courtesy_email_error) structuredRows.push({ icon: <AlertTriangle className="h-3.5 w-3.5" />, label: 'Email Error', value: meta.courtesy_email_error as string });
      if (meta.previous_revision_count != null) structuredRows.push({ icon: <Hash className="h-3.5 w-3.5" />, label: 'Previous Revision Count', value: String(meta.previous_revision_count) });
      break;
    }
  }

  // Remaining raw metadata keys not already shown
  const shownKeys = new Set(['applicant_name', 'applicant_email', 'reviewer_notes', 'role', 'target_user', 'milestones', 'changed_fields', 'operator_name', 'document_type', 'old_expiry', 'new_expiry', 'urgency', 'changes', 'restored_status', 'invalidated_tokens', 'courtesy_email_sent', 'courtesy_email_error', 'previous_revision_count']);
  const rawExtras = Object.entries(meta).filter(([k]) => !shownKeys.has(k));

  return (
    <div className="mt-2 ml-0.5 rounded-lg border border-border bg-secondary/30 overflow-hidden">
      <div className="px-3 py-1.5 bg-muted/40 border-b border-border flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Info className="h-3 w-3 text-muted-foreground" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Entry Detail</span>
        </div>
        {deepLink && onNavigate && (
          <button
            onClick={(e) => { e.stopPropagation(); onNavigate(deepLink); }}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-gold/15 text-gold border border-gold/30 hover:bg-gold/25 transition-colors"
          >
            <ExternalLink className="h-2.5 w-2.5" />
            {deepLink.type === 'operator' ? 'Go to Operator' : deepLink.type === 'application' ? 'Go to Application' : 'Go to Staff Directory'}
          </button>
        )}
      </div>
      <div className="px-3 py-1">
        {structuredRows.map((row, i) => (
          <MetaRow key={i} icon={row.icon} label={row.label} value={row.value} />
        ))}
        {rawExtras.length > 0 && (
          <>
            <div className="pt-2 pb-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Additional Metadata</span>
            </div>
            {rawExtras.map(([k, v]) => (
              <MetaRow
                key={k}
                icon={<Settings2 className="h-3.5 w-3.5" />}
                label={k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                value={typeof v === 'object' ? <span className="font-mono text-[10px] break-all">{JSON.stringify(v)}</span> : String(v)}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

const PAGE_SIZE = 20;

// ── CSV helpers ───────────────────────────────────────────────────────────────

function csvCell(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function buildDetailText(entry: AuditEntry): string {
  const meta = entry.metadata ?? {};
  switch (entry.action) {
    case 'application_approved':
    case 'application_denied':
      return [meta.applicant_email, meta.reviewer_notes].filter(Boolean).join(' — ');
    case 'role_added':
    case 'role_removed':
      return `${entry.action === 'role_added' ? 'Granted' : 'Revoked'} ${formatRole(meta.role as string)} role`;
    case 'operator_status_updated':
      return (meta.milestones as string[])?.join(', ') ?? 'Status updated';
    case 'cert_renewed':
      return `${meta.document_type as string} renewed · was ${meta.old_expiry ? new Date((meta.old_expiry as string) + 'T00:00:00').toLocaleDateString() : 'unknown'} → ${new Date((meta.new_expiry as string) + 'T00:00:00').toLocaleDateString()}`;
    case 'expiry_updated':
      return `Fleet ${meta.document_type as string} · ${meta.old_expiry ? new Date((meta.old_expiry as string) + 'T00:00:00').toLocaleDateString() + ' → ' : ''}${meta.new_expiry ? new Date((meta.new_expiry as string) + 'T00:00:00').toLocaleDateString() : ''} · ${meta.urgency ?? ''}`;
    case 'insurance_fields_updated': {
      const changes = meta.changes as Record<string, unknown> | undefined;
      const fields = changes ? Object.keys(changes) : [];
      return fields.length ? `${fields.length} field${fields.length > 1 ? 's' : ''} updated: ${fields.join(', ')}` : 'Insurance fields updated';
    }
    case 'revision_request_reverted': {
      const parts = [`Restored to ${formatRole(meta.restored_status as string)}`];
      if (meta.invalidated_tokens) parts.push(`${meta.invalidated_tokens} token(s) invalidated`);
      if (meta.courtesy_email_sent) parts.push('courtesy email sent');
      return parts.join(' · ');
    }
    default:
      return '';
  }
}

// Flatten metadata into deterministic key columns for export
const META_EXPORT_KEYS = [
  'applicant_name',
  'applicant_email',
  'reviewer_notes',
  'role',
  'target_user',
  'milestones',
  'changed_fields',
  'document_type',
  'old_expiry',
  'new_expiry',
  'operator_name',
] as const;

function metaColValue(entry: AuditEntry, key: string): string {
  const v = (entry.metadata ?? {})[key];
  if (v === undefined || v === null) return '';
  if (Array.isArray(v)) return v.join('; ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function slugify(v: string): string {
  return v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32);
}

function exportToCsv(
  rows: AuditEntry[],
  currentFilter: string,
  dateFrom?: Date,
  dateTo?: Date,
  extra?: { applicantLabel?: string; actorLabel?: string },
) {
  const metaLabels = META_EXPORT_KEYS.map(k =>
    `Meta: ${k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}`
  );
  const headers = [
    'Timestamp',
    'Action',
    'Actor',
    'Actor ID',
    'Subject',
    'Subject ID',
    'Entity Type',
    'Detail',
    ...metaLabels,
    'Full Metadata (JSON)',
  ];
  const lines = [
    headers.join(','),
    ...rows.map(e => [
      new Date(e.created_at).toISOString(),
      ACTION_CONFIG[e.action]?.label ?? e.action,
      e.actor_name ?? '',
      e.actor_id ?? '',
      e.entity_label ?? '',
      e.entity_id ?? '',
      e.entity_type,
      buildDetailText(e),
      ...META_EXPORT_KEYS.map(k => metaColValue(e, k)),
      e.metadata ? JSON.stringify(e.metadata) : '',
    ].map(csvCell).join(',')),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const filterLabel = currentFilter === 'all' ? 'all' : currentFilter;
  const fromStr = dateFrom ? format(dateFrom, 'yyyy-MM-dd') : '';
  const toStr = dateTo ? format(dateTo, 'yyyy-MM-dd') : '';
  const datePart = fromStr && toStr ? `_${fromStr}_to_${toStr}` : fromStr ? `_from_${fromStr}` : toStr ? `_to_${toStr}` : '';
  const applicantPart = extra?.applicantLabel ? `_applicant-${slugify(extra.applicantLabel)}` : '';
  const actorPart = extra?.actorLabel ? `_staff-${slugify(extra.actorLabel)}` : '';
  a.href = url;
  a.download = `audit-log-${filterLabel}${datePart}${applicantPart}${actorPart}_exported-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Date picker button ────────────────────────────────────────────────────────

function DatePickerButton({
  label,
  date,
  onSelect,
  onClear,
  disabled,
}: {
  label: string;
  date: Date | undefined;
  onSelect: (d: Date | undefined) => void;
  onClear: () => void;
  disabled?: (d: Date) => boolean;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors',
            date
              ? 'bg-surface-dark text-white border-surface-dark'
              : 'bg-white text-muted-foreground border-border hover:border-gold/50 hover:text-foreground'
          )}
        >
          <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
          {date ? format(date, 'MMM d, yyyy') : label}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={onSelect}
          disabled={disabled}
          initialFocus
          className={cn('p-3 pointer-events-auto')}
        />
        {date && (
          <div className="px-3 pb-3">
            <button
              onClick={onClear}
              className="w-full text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1 py-1.5 rounded border border-border hover:border-foreground/30 transition-colors"
            >
              <X className="h-3 w-3" /> Clear date
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

// ── Search helpers ────────────────────────────────────────────────────────────

function entryMatchesSearch(entry: AuditEntry, needle: string): boolean {
  if (!needle) return true;
  const q = needle.toLowerCase();
  const haystack = [
    entry.actor_name,
    entry.entity_label,
    entry.entity_type,
    entry.action,
    entry.actor_id,
    entry.entity_id,
    ACTION_CONFIG[entry.action]?.label,
    entry.metadata ? JSON.stringify(entry.metadata) : '',
  ].filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(q);
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query || !text) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-gold/30 text-foreground rounded-sm px-0.5">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

// ── Filter combobox ───────────────────────────────────────────────────────────

interface ComboboxOption {
  value: string;
  label: string;
  sublabel?: string;
}

function FilterCombobox({
  icon,
  placeholder,
  searchPlaceholder,
  emptyText,
  options,
  value,
  onChange,
}: {
  icon: React.ReactNode;
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
  options: ComboboxOption[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? options.find(o => o.value === value) : null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors max-w-[14rem] truncate',
            value
              ? 'bg-surface-dark text-white border-surface-dark'
              : 'bg-white text-muted-foreground border-border hover:border-gold/50 hover:text-foreground'
          )}
        >
          <span className="shrink-0">{icon}</span>
          <span className="truncate">{selected ? selected.label : placeholder}</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} className="h-9" />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__all__"
                onSelect={() => { onChange(null); setOpen(false); }}
              >
                <Check className={cn('mr-2 h-4 w-4', !value ? 'opacity-100' : 'opacity-0')} />
                <span className="text-muted-foreground">All</span>
              </CommandItem>
              {options.map(opt => (
                <CommandItem
                  key={opt.value}
                  value={`${opt.label} ${opt.sublabel ?? ''} ${opt.value}`}
                  onSelect={() => { onChange(opt.value); setOpen(false); }}
                >
                  <Check className={cn('mr-2 h-4 w-4', value === opt.value ? 'opacity-100' : 'opacity-0')} />
                  <div className="flex flex-col min-w-0">
                    <span className="truncate">{opt.label}</span>
                    {opt.sublabel && (
                      <span className="text-[10px] text-muted-foreground truncate">{opt.sublabel}</span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ActivityLog({ onNavigate }: { onNavigate?: (action: DeepLinkAction) => void }) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [filter, setFilter] = useState('all');
  const [hasMore, setHasMore] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [searchRaw, setSearchRaw] = useState('');
  const [search, setSearch] = useState('');
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [currentAppStatuses, setCurrentAppStatuses] = useState<Record<string, string>>({});
  const [applicantId, setApplicantId] = useState<string | null>(null);
  const [actorId, setActorId] = useState<string | null>(null);
  const [applicantOptions, setApplicantOptions] = useState<ComboboxOption[]>([]);
  const [actorOptions, setActorOptions] = useState<ComboboxOption[]>([]);

  // Load filter options once (applicants from applications table, staff from audit_log distinct actors)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [appsRes, actorsRes] = await Promise.all([
        supabase
          .from('applications')
          .select('id, first_name, last_name, email')
          .order('last_name', { ascending: true })
          .limit(500),
        (supabase as any)
          .from('audit_log')
          .select('actor_id, actor_name')
          .not('actor_id', 'is', null)
          .order('created_at', { ascending: false })
          .limit(2000),
      ]);
      if (cancelled) return;
      if (appsRes.data) {
        setApplicantOptions(
          (appsRes.data as any[]).map(a => ({
            value: a.id as string,
            label: [a.last_name, a.first_name].filter(Boolean).join(', ') || (a.email ?? 'Unknown'),
            sublabel: a.email ?? undefined,
          }))
        );
      }
      if (actorsRes.data) {
        const seen = new Map<string, string>();
        (actorsRes.data as any[]).forEach(r => {
          if (r.actor_id && !seen.has(r.actor_id)) seen.set(r.actor_id, r.actor_name ?? 'Unknown');
        });
        const opts = Array.from(seen.entries())
          .map(([id, name]) => ({ value: id, label: name }))
          .sort((a, b) => a.label.localeCompare(b.label));
        setActorOptions(opts);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSearchChange = (val: string) => {
    setSearchRaw(val);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setSearch(val.trim()), 250);
  };

  // Server-side fetch using the search_audit_log RPC (covers all rows, incl. metadata)
  const fetchLog = useCallback(async (
    pageNum = 0,
    currentFilter = filter,
    from = dateFrom,
    to = dateTo,
    currentSearch = search,
    currentApplicantId: string | null = applicantId,
    currentActorId: string | null = actorId,
  ) => {
    setLoading(true);
    const { data, error } = await (supabase as any).rpc('search_audit_log', {
      p_search: currentSearch || null,
      p_action: currentFilter !== 'all' ? currentFilter : null,
      p_from:   from ? startOfDay(from).toISOString() : null,
      p_to:     to   ? endOfDay(to).toISOString()   : null,
      p_limit:  PAGE_SIZE + 1,
      p_offset: pageNum * PAGE_SIZE,
      p_actor_id: currentActorId,
      p_entity_id: currentApplicantId,
    });
    if (!error && data) {
      const typed = data as AuditEntry[];
      const hasNextPage = typed.length === PAGE_SIZE + 1;
      const page = hasNextPage ? typed.slice(0, -1) : typed;
      setEntries(prev => pageNum === 0 ? page : [...prev, ...page]);
      setHasMore(hasNextPage);
    }
    setLoading(false);
  }, [filter, dateFrom, dateTo, search, applicantId, actorId]);

  // Re-fetch on filter, date, or debounced search change
  useEffect(() => {
    setPage(0);
    setEntries([]);
    fetchLog(0, filter, dateFrom, dateTo, search, applicantId, actorId);
  }, [filter, dateFrom, dateTo, search, applicantId, actorId]);

  // Fetch current review statuses for applications referenced in revision reverted entries
  useEffect(() => {
    const appIds = entries
      .filter(e => e.action === 'revision_request_reverted' && e.entity_type === 'application' && e.entity_id)
      .map(e => e.entity_id!);
    if (appIds.length === 0) {
      setCurrentAppStatuses({});
      return;
    }
    supabase
      .from('applications')
      .select('id, review_status')
      .in('id', appIds)
      .then(({ data, error }) => {
        if (error || !data) return;
        const map: Record<string, string> = {};
        data.forEach((row: any) => {
          map[row.id] = row.review_status;
        });
        setCurrentAppStatuses(map);
      });
  }, [entries]);

  const handleLoadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchLog(next, filter, dateFrom, dateTo, search, applicantId, actorId);
  };

  const handleExport = async () => {
    setExporting(true);
    const { data } = await (supabase as any).rpc('search_audit_log', {
      p_search: search || null,
      p_action: filter !== 'all' ? filter : null,
      p_from:   dateFrom ? startOfDay(dateFrom).toISOString() : null,
      p_to:     dateTo   ? endOfDay(dateTo).toISOString()     : null,
      p_limit:  5000,
      p_offset: 0,
      p_actor_id: actorId,
      p_entity_id: applicantId,
    });
    if (data && data.length > 0) {
      exportToCsv(data as AuditEntry[], filter, dateFrom, dateTo, {
        applicantLabel: applicantId ? applicantOptions.find(o => o.value === applicantId)?.label : undefined,
        actorLabel: actorId ? actorOptions.find(o => o.value === actorId)?.label : undefined,
      });
    }
    setExporting(false);
  };

  const hasDateFilter = !!dateFrom || !!dateTo;
  const clearDates = () => { setDateFrom(undefined); setDateTo(undefined); setActivePreset(null); };

  const applyPreset = (preset: typeof DATE_PRESETS[number]) => {
    const { from, to } = preset.getRange();
    setDateFrom(from);
    setDateTo(to);
    setActivePreset(preset.label);
  };

  // Fetch counts for each action filter respecting current date range
  useEffect(() => {
    const actionValues = FILTER_OPTIONS.filter(o => o.value !== 'all').map(o => o.value);

    // Query each action type + a total "all" count in parallel
    const perActionQueries = actionValues.map(async (action) => {
      let q = supabase
        .from('audit_log' as any)
        .select('id', { count: 'exact', head: true })
        .eq('action', action);
      if (dateFrom) q = q.gte('created_at', startOfDay(dateFrom).toISOString());
      if (dateTo)   q = q.lte('created_at', endOfDay(dateTo).toISOString());
      const { count } = await q;
      return [action, count ?? 0] as [string, number];
    });

    const totalQuery = (async () => {
      let q = supabase
        .from('audit_log' as any)
        .select('id', { count: 'exact', head: true });
      if (dateFrom) q = q.gte('created_at', startOfDay(dateFrom).toISOString());
      if (dateTo)   q = q.lte('created_at', endOfDay(dateTo).toISOString());
      const { count } = await q;
      return ['all', count ?? 0] as [string, number];
    })();

    Promise.all([...perActionQueries, totalQuery]).then((results) => {
      const map: Record<string, number> = {};
      results.forEach(([action, count]) => { map[action] = count; });
      setCounts(map);
    });
  }, [dateFrom, dateTo]);

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Activity Log</h1>
          <p className="text-sm text-muted-foreground mt-1">Audit trail of all significant actions across the platform</p>
        </div>
        {/* Search + actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Search actor, subject, keyword…"
              value={searchRaw}
              onChange={e => handleSearchChange(e.target.value)}
              className="pl-8 pr-8 py-1.5 text-xs rounded-lg border border-border bg-white focus:outline-none focus:ring-1 focus:ring-gold/50 focus:border-gold/50 w-64 text-foreground placeholder:text-muted-foreground transition-colors"
            />
            {searchRaw && (
              <button
                onClick={() => { setSearchRaw(''); setSearch(''); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exporting || loading || entries.length === 0}
            className="gap-1.5"
          >
            <Download className={`h-3.5 w-3.5 ${exporting ? 'animate-bounce' : ''}`} />
            {exporting ? 'Exporting…' : 'Export CSV'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setPage(0); setEntries([]); fetchLog(0, filter, dateFrom, dateTo, search, applicantId, actorId); }}
            disabled={loading}
            className="gap-1.5"
          >
            <RefreshCcw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 items-center">
        {FILTER_OPTIONS.map(opt => {
          const count = counts[opt.value];
          const isActive = filter === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => setFilter(opt.value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                isActive
                  ? 'bg-surface-dark text-white border-surface-dark'
                  : 'bg-white text-muted-foreground border-border hover:border-gold/50 hover:text-foreground'
              }`}
            >
              {opt.label}
              {count !== undefined && (
                <span className={`inline-flex items-center justify-center min-w-[1.1rem] h-[1.1rem] rounded-full px-1 text-[10px] font-semibold leading-none ${
                  isActive
                    ? 'bg-white/20 text-white'
                    : 'bg-muted text-muted-foreground'
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}

        {/* Separator */}
        <div className="w-px h-5 bg-border mx-1" />

        {/* Date preset shortcuts */}
        {DATE_PRESETS.map(preset => (
          <button
            key={preset.label}
            onClick={() => applyPreset(preset)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              activePreset === preset.label
                ? 'bg-gold/20 text-foreground border-gold/50'
                : 'bg-white text-muted-foreground border-border hover:border-gold/50 hover:text-foreground'
            }`}
          >
            {preset.label}
          </button>
        ))}

        {/* Separator */}
        <div className="w-px h-5 bg-border mx-1" />

        {/* Date range pickers */}
        <DatePickerButton
          label="From date"
          date={dateFrom}
          onSelect={(d) => { setDateFrom(d); setActivePreset(null); }}
          onClear={() => { setDateFrom(undefined); setActivePreset(null); }}
          disabled={dateTo ? (d) => d > dateTo : undefined}
        />
        <span className="text-xs text-muted-foreground">–</span>
        <DatePickerButton
          label="To date"
          date={dateTo}
          onSelect={(d) => { setDateTo(d); setActivePreset(null); }}
          onClear={() => { setDateTo(undefined); setActivePreset(null); }}
          disabled={dateFrom ? (d) => d < dateFrom : undefined}
        />

        {hasDateFilter && (
          <button
            onClick={clearDates}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground border border-transparent hover:border-border transition-colors"
          >
            <X className="h-3 w-3" /> Clear dates
          </button>
        )}
      </div>

      {/* Active date range summary */}
      {hasDateFilter && (
        <p className="text-xs text-muted-foreground -mt-2">
          Showing entries
          {dateFrom ? ` from ${format(dateFrom, 'MMM d, yyyy')}` : ''}
          {dateTo   ? ` to ${format(dateTo, 'MMM d, yyyy')}` : ''}
        </p>
      )}

      {/* Timeline */}
      <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
        {/* Search result info bar */}
        {search && !loading && (
          <div className="px-5 py-2 bg-gold/5 border-b border-gold/20 flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              Searching all records — <span className="font-medium text-foreground">{entries.length}{hasMore ? '+' : ''}</span> result{entries.length !== 1 ? 's' : ''} for <span className="font-medium text-foreground">"{search}"</span>
            </span>
            <button onClick={() => { setSearchRaw(''); setSearch(''); }} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
              <X className="h-3 w-3" /> Clear search
            </button>
          </div>
        )}
        {loading && entries.length === 0 ? (
          <div className="py-16 flex flex-col items-center gap-3 text-muted-foreground">
            <RefreshCcw className="h-6 w-6 animate-spin opacity-40" />
            <p className="text-sm">Loading activity…</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="py-16 flex flex-col items-center gap-3 text-muted-foreground">
            <Activity className="h-10 w-10 opacity-20" />
            <p className="text-sm font-medium">{search ? 'No matching entries' : 'No activity found'}</p>
            <p className="text-xs">
              {search
                ? `No entries match "${search}". Try a different keyword or clear the search.`
                : hasDateFilter
                  ? 'Try adjusting the date range or clearing the filter.'
                  : 'Actions like approvals, role changes, and milestones will appear here.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {entries.map((entry, idx) => {
              const cfg = ACTION_CONFIG[entry.action] ?? {
                label: entry.action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                icon: <Shield className="h-4 w-4" />,
                color: 'text-muted-foreground',
                bg: 'bg-muted border-border',
              };
              const isExpanded = expandedId === entry.id;

              return (
                <div key={entry.id} className={cn('transition-colors', isExpanded ? 'bg-secondary/30' : 'hover:bg-secondary/20')}>
                  <button
                    className="w-full text-left flex gap-4 px-5 py-4 group"
                    onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                    aria-expanded={isExpanded}
                  >
                    {/* Icon + spine */}
                    <div className="flex flex-col items-center shrink-0 pt-0.5">
                      <div className={`h-8 w-8 rounded-full border flex items-center justify-center ${cfg.bg} ${cfg.color}`}>
                        {cfg.icon}
                      </div>
                      {idx < entries.length - 1 && !isExpanded && (
                        <div className="w-px flex-1 bg-border mt-2 min-h-3" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 pb-1">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`text-xs font-semibold uppercase tracking-wide ${cfg.color}`}>
                              {cfg.label}
                            </span>
                          </div>
                          {entry.entity_label && (
                            <p className="text-sm font-medium text-foreground mt-0.5">
                              {highlightMatch(entry.entity_label, search)}
                            </p>
                          )}
                          <EntryDetail entry={entry} currentStatuses={currentAppStatuses} />
                        </div>
                        <div className="flex items-start gap-2 shrink-0">
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">{timeAgo(entry.created_at)}</p>
                            <p className="text-xs text-muted-foreground/60 mt-0.5">
                              {new Date(entry.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                          <div className={cn(
                            'mt-0.5 h-5 w-5 rounded flex items-center justify-center border transition-all',
                            isExpanded
                              ? 'bg-surface-dark text-white border-surface-dark'
                              : 'text-muted-foreground border-border group-hover:border-gold/50 group-hover:text-foreground'
                          )}>
                            {isExpanded
                              ? <ChevronDown className="h-3 w-3" />
                              : <ChevronRight className="h-3 w-3" />
                            }
                          </div>
                        </div>
                      </div>
                      {entry.actor_name && (
                        <p className="text-xs text-muted-foreground mt-1">
                          by <span className="font-medium text-foreground">{highlightMatch(entry.actor_name, search)}</span>
                        </p>
                      )}
                    </div>
                  </button>

                  {/* Expanded detail panel */}
                  {isExpanded && (
                    <div className="px-5 pb-4 ml-12">
                      <EntryExpandedPanel entry={entry} onNavigate={onNavigate} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}


        {hasMore && (
          <div className="px-5 py-3 border-t border-border">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLoadMore}
              disabled={loading}
              className="w-full gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <ChevronDown className="h-3.5 w-3.5" />
              Load more
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
