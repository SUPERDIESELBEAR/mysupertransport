import { ReactNode, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import {
  LogOut, Menu, X, ChevronDown, KeyRound, UserPen,
} from 'lucide-react';
import logo from '@/assets/supertransport-logo.png';
import type { Database } from '@/integrations/supabase/types';
import NotificationBell from '@/components/NotificationBell';
import ChangePasswordModal from '@/components/ChangePasswordModal';
import EditProfileModal from '@/components/EditProfileModal';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

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
  /** Subset of navItems to show in the mobile bottom bar. Falls back to navItems if omitted. */
  mobileNavItems?: NavItem[];
  currentPath: string;
  onNavigate: (path: string) => void;
  title: string;
  headerActions?: ReactNode;
  /** Path for the bell dropdown 'View all →' link. Defaults to /staff?tab=notifications */
  notificationsPath?: string;
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

export default function StaffLayout({ children, navItems, mobileNavItems, currentPath, onNavigate, title, headerActions, notificationsPath = '/staff?tab=notifications' }: StaffLayoutProps) {
  const { profile, roles, activeRole, setActiveRole, signOut, refreshProfile } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false); // default closed on mobile
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [roleSwitchOpen, setRoleSwitchOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);

  const displayName = profile ? `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() : 'User';
  const initials = displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '??';

  // On desktop: collapsed/expanded sidebar. On mobile: overlay drawer.
  const handleNavClick = (path: string) => {
    onNavigate(path);
    setMobileSidebarOpen(false); // close mobile drawer on nav
  };

  const sidebarContent = (isMobileDrawer = false) => (
    <>
      {/* Logo */}
      <div className="h-16 flex items-center px-4 border-b border-surface-dark-border gap-3 shrink-0">
        <img
          src={logo}
          alt="SUPERTRANSPORT"
          className={`object-contain shrink-0 transition-all duration-200 ${(sidebarOpen || isMobileDrawer) ? 'h-10 w-auto max-w-[140px]' : 'h-8 w-8'}`}
        />
        {(sidebarOpen || isMobileDrawer) && (
          <p className="text-gold text-xs font-medium truncate">{title}</p>
        )}
        {isMobileDrawer && (
          <button
            onClick={() => setMobileSidebarOpen(false)}
            className="ml-auto text-surface-dark-muted hover:text-surface-dark-foreground transition-colors p-1"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex-1 py-4 space-y-1 px-2 overflow-y-auto">
        {navItems.map((item) => (
          <button
            key={item.path}
            onClick={() => handleNavClick(item.path)}
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
            {(sidebarOpen || isMobileDrawer) && (
              <span className="flex-1 flex items-center justify-between min-w-0">
                <span className="truncate">{item.label}</span>
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
      <div className="p-3 border-t border-surface-dark-border space-y-2 shrink-0">
        {/* Role switcher */}
        {roles.length > 1 && (sidebarOpen || isMobileDrawer) && (
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
          <div className="h-8 w-8 rounded-full overflow-hidden border border-gold/30 shrink-0 flex items-center justify-center bg-gold/20">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt={displayName} className="h-full w-full object-cover" />
            ) : (
              <span className="text-gold text-xs font-bold">{initials}</span>
            )}
          </div>
          {(sidebarOpen || isMobileDrawer) && (
            <>
              <div className="flex-1 min-w-0">
                <p className="text-surface-dark-foreground text-xs font-medium truncate">{displayName}</p>
              </div>
              <button
                type="button"
                onClick={() => setChangePasswordOpen(true)}
                title="Change password"
                className="text-surface-dark-muted hover:text-surface-dark-foreground transition-colors p-1 rounded"
              >
                <KeyRound className="h-4 w-4" />
              </button>
              <button
                type="button"
                data-sign-out="true"
                onClick={() => setSignOutOpen(true)}
                title="Sign out"
                className="text-surface-dark-muted hover:text-destructive transition-colors p-1 rounded"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );

  return (
    <>
    <ChangePasswordModal open={changePasswordOpen} onClose={() => setChangePasswordOpen(false)} />
    <AlertDialog open={signOutOpen} onOpenChange={setSignOutOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Sign out?</AlertDialogTitle>
          <AlertDialogDescription>You will be returned to the login screen.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => signOut()}>Sign out</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <div className="flex h-screen bg-secondary overflow-hidden">
      {/* ── Mobile overlay sidebar ─────────────────────────────────── */}
      {mobileSidebarOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setMobileSidebarOpen(false)}
          />
          {/* Drawer */}
          <aside className="fixed inset-y-0 left-0 w-64 bg-surface-dark flex flex-col border-r border-surface-dark-border z-50 lg:hidden animate-fade-in">
            {sidebarContent(true)}
          </aside>
        </>
      )}

      {/* ── Desktop sidebar ────────────────────────────────────────── */}
      <aside className={`hidden lg:flex ${sidebarOpen ? 'w-60' : 'w-16'} transition-all duration-200 bg-surface-dark flex-col border-r border-surface-dark-border shrink-0`}>
        {sidebarContent(false)}
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top bar */}
        <header className="h-14 lg:h-16 bg-white border-b border-border flex items-center px-4 lg:px-6 gap-3 lg:gap-4 shrink-0">
          {/* Mobile hamburger — only shown when bottom nav is NOT shown; kept for "more" access on tablet */}
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="lg:hidden text-muted-foreground hover:text-foreground transition-colors"
          >
            <Menu className="h-5 w-5" />
          </button>
          {/* Desktop collapse toggle */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="hidden lg:block text-muted-foreground hover:text-foreground transition-colors"
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div className="flex-1 min-w-0" />
          {headerActions}
          <NotificationBell notificationsPath={notificationsPath} />
        </header>

        {/* Page content — pb-20 on mobile to clear the sticky bottom nav */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 pb-20 lg:pb-6">
          {children}
        </main>
      </div>

      {/* ── Sticky bottom nav (mobile only) ───────────────────────── */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-surface-dark border-t border-surface-dark-border">
        <div className="flex items-stretch h-16">
          {(mobileNavItems ?? navItems).map((item) => {
            const isActive = currentPath === item.path;
            return (
              <button
                key={item.path}
                onClick={() => { onNavigate(item.path); setMobileSidebarOpen(false); }}
                className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors min-w-0 px-1
                  ${isActive
                    ? 'text-gold'
                    : 'text-surface-dark-muted hover:text-surface-dark-foreground'
                  }`}
              >
                {/* Active indicator bar */}
                {isActive && (
                  <span className="absolute top-0 inset-x-2 h-0.5 bg-gold rounded-b-full" />
                )}
                {/* Icon with badge */}
                <span className="relative">
                  {item.icon}
                  {item.badge != null && item.badge > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-0.5 rounded-full bg-destructive text-white text-[9px] font-bold flex items-center justify-center leading-none">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                </span>
                <span className="truncate w-full text-center leading-tight">{item.label}</span>
              </button>
            );
          })}
        </div>
        {/* Safe-area spacer for iOS home indicator */}
        <div className="h-safe-bottom bg-surface-dark" />
      </nav>
    </div>
    </>
  );
}
