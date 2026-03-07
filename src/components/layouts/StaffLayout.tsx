import { ReactNode, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  LayoutDashboard, Users, Truck, FileText, MessageSquare, Bell,
  LogOut, Menu, X, ChevronDown, Settings
} from 'lucide-react';
import logo from '@/assets/supertransport-logo.png';
import type { Database } from '@/integrations/supabase/types';

type AppRole = Database['public']['Enums']['app_role'];

interface NavItem {
  label: string;
  icon: ReactNode;
  path: string;
}

interface StaffLayoutProps {
  children: ReactNode;
  navItems: NavItem[];
  currentPath: string;
  onNavigate: (path: string) => void;
  title: string;
}

const roleColors: Record<AppRole, string> = {
  management: 'bg-gold text-surface-dark',
  onboarding_staff: 'bg-blue-600 text-white',
  dispatcher: 'bg-green-600 text-white',
  operator: 'bg-purple-600 text-white',
  applicant: 'bg-gray-600 text-white',
};

const roleLabels: Record<AppRole, string> = {
  management: 'Management',
  onboarding_staff: 'Onboarding',
  dispatcher: 'Dispatcher',
  operator: 'Operator',
  applicant: 'Applicant',
};

export default function StaffLayout({ children, navItems, currentPath, onNavigate, title }: StaffLayoutProps) {
  const { profile, roles, activeRole, setActiveRole, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [roleSwitchOpen, setRoleSwitchOpen] = useState(false);

  const displayName = profile ? `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() : 'User';
  const initials = displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '??';

  return (
    <div className="flex h-screen bg-secondary overflow-hidden">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-60' : 'w-16'} transition-all duration-200 bg-surface-dark flex flex-col border-r border-surface-dark-border shrink-0`}>
        {/* Logo */}
        <div className="h-16 flex items-center px-4 border-b border-surface-dark-border">
          <div className="h-8 w-8 rounded-full bg-gold flex items-center justify-center shrink-0">
            <Truck className="h-4 w-4 text-surface-dark" />
          </div>
          {sidebarOpen && (
            <div className="ml-3 overflow-hidden">
              <p className="text-surface-dark-foreground text-sm font-bold tracking-wide leading-none">SUPERTRANSPORT</p>
              <p className="text-gold text-xs mt-0.5">{title}</p>
            </div>
          )}
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-4 space-y-1 px-2 overflow-y-auto">
          {navItems.map((item) => (
            <button
              key={item.path}
              onClick={() => onNavigate(item.path)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                currentPath === item.path
                  ? 'bg-gold/15 text-gold border border-gold/25'
                  : 'text-surface-dark-muted hover:text-surface-dark-foreground hover:bg-surface-dark-card'
              }`}
            >
              <span className="shrink-0">{item.icon}</span>
              {sidebarOpen && <span className="truncate">{item.label}</span>}
            </button>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-surface-dark-border space-y-2">
          {/* Role switcher */}
          {roles.length > 1 && sidebarOpen && (
            <div className="relative">
              <button
                onClick={() => setRoleSwitchOpen(!roleSwitchOpen)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-surface-dark-card border border-surface-dark-border text-xs text-surface-dark-foreground hover:border-gold/40 transition-colors"
              >
                <span className="text-surface-dark-muted">Active role:</span>
                <div className="flex items-center gap-1.5">
                  <Badge className={`text-xs py-0 px-1.5 ${activeRole ? roleColors[activeRole] : ''}`}>
                    {activeRole ? roleLabels[activeRole] : 'None'}
                  </Badge>
                  <ChevronDown className="h-3 w-3 text-surface-dark-muted" />
                </div>
              </button>
              {roleSwitchOpen && (
                <div className="absolute bottom-full left-0 right-0 mb-1 bg-surface-dark-card border border-surface-dark-border rounded-lg overflow-hidden shadow-xl z-50">
                  {roles.map(role => (
                    <button
                      key={role}
                      onClick={() => { setActiveRole(role); setRoleSwitchOpen(false); }}
                      className={`w-full flex items-center gap-2 px-3 py-2.5 text-xs hover:bg-surface-dark transition-colors ${role === activeRole ? 'text-gold' : 'text-surface-dark-foreground'}`}
                    >
                      <Badge className={`text-xs py-0 px-1.5 ${roleColors[role]}`}>{roleLabels[role]}</Badge>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* User / Sign out */}
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-gold/20 border border-gold/30 flex items-center justify-center shrink-0">
              <span className="text-gold text-xs font-bold">{initials}</span>
            </div>
            {sidebarOpen && (
              <>
                <div className="flex-1 min-w-0">
                  <p className="text-surface-dark-foreground text-xs font-medium truncate">{displayName}</p>
                </div>
                <button onClick={signOut} className="text-surface-dark-muted hover:text-destructive transition-colors p-1">
                  <LogOut className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-16 bg-white border-b border-border flex items-center px-6 gap-4 shrink-0">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-muted-foreground hover:text-foreground transition-colors">
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div className="flex-1" />
          <button className="relative text-muted-foreground hover:text-foreground transition-colors p-2">
            <Bell className="h-5 w-5" />
          </button>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
