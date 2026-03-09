import { ReactNode, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import {
  LogOut, Menu, X, ChevronDown,
} from 'lucide-react';
import logo from '@/assets/supertransport-logo.png';
import type { Database } from '@/integrations/supabase/types';
import NotificationBell from '@/components/NotificationBell';

type AppRole = Database['public']['Enums']['app_role'];

interface NavItem {
  label: string;
  icon: ReactNode;
  path: string;
  badge?: number;
}

interface StaffLayoutProps {
  children: ReactNode;
  navItems: NavItem[];
  currentPath: string;
  onNavigate: (path: string) => void;
  title: string;
  headerActions?: ReactNode;
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
        <div className="h-16 flex items-center px-4 border-b border-surface-dark-border gap-3">
          <img src={logo} alt="SUPERTRANSPORT" className={`${sidebarOpen ? 'h-10' : 'h-8'} w-auto shrink-0 transition-all duration-200`} />
          {sidebarOpen && (
            <p className="text-gold text-xs font-medium truncate">{title}</p>
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
              {/* Icon with optional badge */}
              <span className="relative shrink-0">
                {item.icon}
                {item.badge != null && item.badge > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-0.5 rounded-full bg-destructive text-white text-[10px] font-bold flex items-center justify-center leading-none">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </span>
              {sidebarOpen && (
                <span className="flex-1 flex items-center justify-between min-w-0">
                  <span className="truncate">{item.label}</span>
                  {/* Show count as pill when sidebar is open */}
                  {item.badge != null && item.badge > 0 && (
                    <span className="ml-1.5 shrink-0 h-4 min-w-4 px-1 rounded-full bg-destructive text-white text-[10px] font-bold flex items-center justify-center leading-none">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-surface-dark-border space-y-2">
          {/* Role switcher */}
          {roles.length > 1 && sidebarOpen && (
            <div className="relative">
              <button
                type="button"
                data-role-switcher="true"
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
                      type="button"
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
                <button
                  type="button"
                  data-sign-out="true"
                  onClick={() => { if (window.confirm('Sign out?')) signOut(); }}
                  title="Sign out"
                  className="text-surface-dark-muted hover:text-destructive transition-colors p-1 rounded"
                >
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
          <NotificationBell />
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
