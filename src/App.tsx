import { Suspense, lazy, useEffect, useRef, type ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { DemoModeProvider } from "@/hooks/useDemoMode";
import IdleWarningModal from "@/components/IdleWarningModal";
import PWAInstallBanner from "@/components/PWAInstallBanner";
import PWAInstallBannerBoundary from "@/components/PWAInstallBannerBoundary";
import TrackOperatorPresence from "@/components/TrackOperatorPresence";
import OfflineBanner from "@/components/OfflineBanner";
import BuildStatusBanner from "@/components/BuildStatusBanner";
import { useVersionCheck } from "@/hooks/useVersionCheck";
import { appendRouteTrace } from "@/lib/navTrace";

// Pages — eager entry points (hit on cold start)
import LoginPage from "./pages/LoginPage";
import ResetPassword from "./pages/ResetPassword";
import WelcomeOperator from "./pages/WelcomeOperator";
import ApplicationForm from "./pages/ApplicationForm";
import ApplicationStatus from "./pages/ApplicationStatus";
import NotFound from "./pages/NotFound";
import SplashPage from "./pages/SplashPage";
import InspectionSharePage from "./pages/InspectionSharePage";
import SubmitSSN from "./pages/SubmitSSN";
import InstallApp from "./pages/InstallApp";
import PEIRespond from "./pages/PEIRespond";
import PEIRelease from "./pages/PEIRelease";
import ApplicationApprove from "./pages/ApplicationApprove";
import QPassportView from "./pages/QPassportView";
import PassengerAuthSign from "./pages/PassengerAuthSign";

// Heavy authenticated portals — code-split out of the initial bundle
const OperatorPortal = lazy(() => import("./pages/operator/OperatorPortal"));
const StaffPortal = lazy(() => import("./pages/staff/StaffPortal"));
const ManagementPortal = lazy(() => import("./pages/management/ManagementPortal"));
const DispatchPortal = lazy(() => import("./pages/dispatch/DispatchPortal"));

const queryClient = new QueryClient();

function PortalFallback() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface-dark">
      <div className="flex flex-col items-center gap-4">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-gold border-t-transparent" />
        <p className="text-sm text-surface-dark-muted font-medium tracking-wide">SUPERDRIVE</p>
      </div>
    </div>
  );
}

/**
 * Redirects to /login while preserving the original path+search as ?next=,
 * so deep links from emails (e.g. /operator?tab=documents) survive sign-in.
 */
function LoginRedirect() {
  const location = useLocation();
  const next = `${location.pathname}${location.search}`;
  const target = next && next !== '/login'
    ? `/login?next=${encodeURIComponent(next)}`
    : '/login';
  return <Navigate to={target} replace />;
}

/**
 * Records every location change (including popstate/back-forward and router
 * `<Navigate replace>` bounces) into the shared nav-trace ring buffer. Runs
 * above the portal components so it catches unmount/remount cycles the
 * per-portal instrumentation misses.
 */
function NavTraceRouterListener() {
  const location = useLocation();
  const prevRef = useRef<{ pathname: string; search: string } | null>(null);
  useEffect(() => {
    const prev = prevRef.current;
    let historyState: unknown = null;
    try { historyState = window.history.state; } catch { /* ignore */ }
    appendRouteTrace({
      event: 'router-location',
      path: location.pathname,
      search: location.search,
      prevPath: prev?.pathname ?? null,
      prevSearch: prev?.search ?? null,
      historyLen: typeof window !== 'undefined' ? window.history.length : null,
      historyStateKey: (historyState as { key?: string } | null)?.key ?? null,
      historyStateIdx: (historyState as { idx?: number } | null)?.idx ?? null,
      visibility: typeof document !== 'undefined' ? document.visibilityState : null,
    });
    prevRef.current = { pathname: location.pathname, search: location.search };
  }, [location.pathname, location.search]);
  return null;
}

/** Records which branch a role-gated route rendered on each pass. */
function GuardTrace({ route, branch, children }: { route: string; branch: string; children: ReactNode }) {
  useEffect(() => {
    appendRouteTrace({ event: 'guard-render', route, branch });
  }, [route, branch]);
  return <>{children}</>;
}

function AppRoutes() {
  const { user, loading, roles, rolesLoaded, isManagement, isOnboardingStaff, isDispatcher, isOperator, isTruckOwner, activeRole } = useAuth();

  // Poll for new builds and prompt logged-in users to refresh
  useVersionCheck();


  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-dark">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-gold border-t-transparent" />
          <p className="text-sm text-surface-dark-muted font-medium tracking-wide">SUPERDRIVE</p>
        </div>
      </div>
    );
  }

  return (
    <Suspense fallback={<PortalFallback />}>
    <Routes>
      {/* Public routes */}
      <Route path="/apply" element={<ApplicationForm />} />
      <Route path="/apply/ssn" element={<SubmitSSN />} />
      <Route path="/login" element={!user ? <LoginPage /> : <Navigate to="/dashboard" replace />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/welcome" element={<WelcomeOperator />} />
      <Route path="/inspect/:token" element={<InspectionSharePage />} />
      <Route path="/pei/respond/:token" element={<PEIRespond />} />
      <Route path="/pei/release/:token" element={<PEIRelease />} />
      <Route path="/application/approve/:token" element={<ApplicationApprove />} />
      <Route path="/splash" element={<SplashPage />} />
      <Route path="/install" element={<InstallApp />} />
      <Route path="/qpassport/view" element={<QPassportView />} />
      <Route path="/passenger-auth/:token" element={<PassengerAuthSign />} />

      {/* Protected routes */}
      <Route path="/dashboard" element={
        !user ? <LoginRedirect /> :
        (roles.length === 0 && !activeRole) ? (
          <div className="flex min-h-screen items-center justify-center bg-surface-dark">
            <div className="flex flex-col items-center gap-4">
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-gold border-t-transparent" />
              <p className="text-sm text-surface-dark-muted font-medium tracking-wide">SUPERDRIVE</p>
            </div>
          </div>
        ) :
        activeRole === 'owner' ? <ManagementPortal /> :
        activeRole === 'management' ? <ManagementPortal /> :
        activeRole === 'onboarding_staff' ? <StaffPortal /> :
        activeRole === 'dispatcher' ? <Navigate to="/dispatch" replace /> :
        activeRole === 'operator' ? <OperatorPortal /> :
        activeRole === 'truck_owner' ? <OperatorPortal /> :
        <ApplicationStatus />
      } />

      {/* Role-specific portals */}
      <Route path="/staff/*" element={
        !user ? <LoginRedirect /> :
        (isOnboardingStaff || isManagement) ? <StaffPortal /> :
        !rolesLoaded ? <PortalFallback /> :
        <Navigate to="/dashboard" replace />
      } />
      <Route path="/dispatch/*" element={
        !user ? <LoginRedirect /> :
        (isDispatcher || isManagement) ? <DispatchPortal /> :
        !rolesLoaded ? <PortalFallback /> :
        <Navigate to="/dashboard" replace />
      } />
      <Route path="/management/*" element={
        !user ? <LoginRedirect /> :
        isManagement ? <ManagementPortal /> :
        !rolesLoaded ? <PortalFallback /> :
        <Navigate to="/dashboard" replace />
      } />
      <Route path="/operator/*" element={
        !user ? (
          <GuardTrace route="/operator/*" branch="login-redirect"><LoginRedirect /></GuardTrace>
        ) : (isOperator || isTruckOwner || isManagement) ? (
          <GuardTrace route="/operator/*" branch="operator-portal"><OperatorPortal /></GuardTrace>
        ) : !rolesLoaded ? (
          // Roles are still loading (or being re-fetched after a token
          // refresh). Show the neutral portal fallback instead of bouncing to
          // /dashboard — otherwise a mid-navigation refetch snaps drivers
          // back to Status.
          <GuardTrace route="/operator/*" branch="waiting-roles"><PortalFallback /></GuardTrace>
        ) : (
          <GuardTrace route="/operator/*" branch="navigate-dashboard"><Navigate to="/dashboard" replace /></GuardTrace>
        )
      } />
      <Route path="/owner/*" element={
        !user ? (
          <GuardTrace route="/owner/*" branch="login-redirect"><LoginRedirect /></GuardTrace>
        ) : (isTruckOwner || isManagement) ? (
          <GuardTrace route="/owner/*" branch="operator-portal"><OperatorPortal /></GuardTrace>
        ) : !rolesLoaded ? (
          <GuardTrace route="/owner/*" branch="waiting-roles"><PortalFallback /></GuardTrace>
        ) : (
          <GuardTrace route="/owner/*" branch="navigate-dashboard"><Navigate to="/dashboard" replace /></GuardTrace>
        )
      } />
      <Route path="/status" element={
        !user ? <LoginRedirect /> :
        <ApplicationStatus />
      } />

      {/* Root redirect */}
      <Route path="/" element={user ? <Navigate to="/dashboard" replace /> : <SplashPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
    </Suspense>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <DemoModeProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <NavTraceRouterListener />
            <AppRoutes />
            <IdleWarningModal />
            <TrackOperatorPresence />
          </BrowserRouter>
          <OfflineBanner />
          <PWAInstallBannerBoundary>
            <PWAInstallBanner />
          </PWAInstallBannerBoundary>
        </TooltipProvider>
      </DemoModeProvider>
      </AuthProvider>
      <BuildStatusBanner />
  </QueryClientProvider>
);

export default App;
