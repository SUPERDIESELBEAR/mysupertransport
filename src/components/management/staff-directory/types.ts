import { Shield, Users, Truck } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';
import type { ReactNode } from 'react';
import { createElement } from 'react';

export type AppRole = Database['public']['Enums']['app_role'];
export type StaffRole = 'onboarding_staff' | 'dispatcher' | 'management';

export interface StaffMember {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  account_status: string;
  created_at: string;
  updated_at: string;
  roles: AppRole[];
  assigned_operator_count: number;
  avatar_url?: string | null;
}

export const ROLE_CONFIG: Record<StaffRole, { label: string; icon: ReactNode; color: string; desc: string }> = {
  management: {
    label: 'Management',
    icon: createElement(Shield, { className: 'h-3 w-3' }),
    color: 'bg-gold/15 text-gold-muted border-gold/30',
    desc: 'Full access: applications, pipeline, staff, and dispatch.',
  },
  onboarding_staff: {
    label: 'Onboarding Staff',
    icon: createElement(Users, { className: 'h-3 w-3' }),
    color: 'bg-status-complete/15 text-status-complete border-status-complete/30',
    desc: 'Manage operator pipeline, onboarding status, and documents.',
  },
  dispatcher: {
    label: 'Dispatcher',
    icon: createElement(Truck, { className: 'h-3 w-3' }),
    color: 'bg-blue-500/15 text-blue-600 border-blue-300',
    desc: 'Manage active dispatch statuses and load assignments.',
  },
};

export const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  active: { label: 'Active', color: 'bg-status-complete/15 text-status-complete border-status-complete/30' },
  pending: { label: 'Pending', color: 'bg-status-in-progress/15 text-status-in-progress border-status-in-progress/30' },
  inactive: { label: 'Inactive', color: 'bg-muted text-muted-foreground border-border' },
  denied: { label: 'Denied', color: 'bg-destructive/15 text-destructive border-destructive/30' },
};

export const ALL_STAFF_ROLES: StaffRole[] = ['onboarding_staff', 'dispatcher', 'management'];