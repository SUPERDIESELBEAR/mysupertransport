import { Suspense, lazy, useEffect, useRef, type ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import DemoSuppressionSheet from "@/components/eld/DemoSuppressionSheet";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { DemoModeProvider } from "@/hooks/useDemoMode";
import { ShowDemoProvider } from "@/hooks/useShowDemo";
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
import BinderShareBundlePage from "./pages/BinderShareBundlePage";
import ShortLinkRedirect from "./pages/ShortLinkRedirect";
import SubmitSSN from "./pages/SubmitSSN";
import InboxShot from "./pages/__InboxShot";
import InstallApp from "./pages/InstallApp";
import PEIRespond from "./pages/PEIRespond";
import PEIRelease from "./pages/PEIRelease";
import IcaReview from "./pages/IcaReview";
import ApplicationApprove from "./pages/ApplicationApprove";
import QPassportView from "./pages/QPassportView";
import PassengerAuthSign from "./pages/PassengerAuthSign";
import PreviewLogin from "./pages/PreviewLogin";
import PreviewSessionBanner from "@/components/PreviewSessionBanner";
import { lazyWithRetry } from '@/lib/lazyWithRetry';
import PortalErrorBoundary from "@/components/shared/PortalErrorBoundary";

// Labels for the destination named in the portal error fallback.
const roleLabels: Record<string, string> = {
  owner: 'Owner',
  management: 'Management',
  onboarding_staff: 'Onboarding',
  dispatcher: 'Dispatch',
  operator: 'Driver',
  applicant: 'Applicant',
  truck_owner: 'Truck Owner',
};

// Heavy authenticated portals — code-split out of the initial bundle
const OperatorPortal = lazyWithRetry(() => import("./pages/operator/OperatorPortal"));
const StaffPortal = lazyWithRetry(() => import("./pages/staff/StaffPortal"));
const ManagementPortal = lazyWithRetry(() => import("./pages/management/ManagementPortal"));
const DispatchPortal = lazyWithRetry(() => import("./pages/dispatch/DispatchPortal"));
const DeactivationPage = lazyWithRetry(() => import("./pages/management/DeactivationPage"));
// Officer email merge. Split out because it pulls pdf-lib, and deliberately
// outside /roadside's module graph for the same reason.
const OfficerEmailSheet = lazyWithRetry(() => import("./components/eld/OfficerEmailSheet"));

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

/**
 * Starts the ELD sync runner (and, through it, the pending-notice drain) once
 * a session exists. Mounted below the auth guard, never in main.tsx: the
 * runner imports the Supabase client, and /roadside boots through its own
 * module graph that must stay Supabase-free. The import is dynamic so the
 * queue never enters the entry chunk.
 */
function SyncRunnerMount() {
  useEffect(() => {
    let cancelled = false;
    void import("@/lib/eld/offline/queue/runner").then(({ startSyncRunner }) => {
      if (!cancelled) startSyncRunner();
    }).catch((err) => {
      console.error("[eld-sync] runner failed to start", err);
    });
    return () => { cancelled = true; };
  }, []);
  return null;
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
    {user ? <SyncRunnerMount /> : null}
    <Routes>
      {/* Public routes */}
      <Route path="/apply" element={<ApplicationForm />} />
      <Route path="/apply/ssn" element={<SubmitSSN />} />
      <Route path="/login" element={!user ? <LoginPage /> : <Navigate to="/dashboard" replace />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/welcome" element={<WelcomeOperator />} />
      <Route path="/inspect/all/:token" element={<BinderShareBundlePage />} />
      <Route path="/inspect/:token" element={<InspectionSharePage />} />
      <Route path="/s/:code" element={<ShortLinkRedirect />} />
      <Route path="/pei/respond/:token" element={<PEIRespond />} />
      <Route path="/pei/release/:token" element={<PEIRelease />} />
      <Route path="/ica/review/:token" element={<IcaReview />} />
      <Route path="/application/approve/:token" element={<ApplicationApprove />} />
      <Route path="/splash" element={<SplashPage />} />
      <Route path="/install" element={<InstallApp />} />
      <Route path="/__inbox-shot" element={<InboxShot />} />
      <Route path="/qpassport/view" element={<QPassportView />} />
      <Route path="/passenger-auth/:token" element={<PassengerAuthSign />} />
      <Route path="/preview-login" element={<PreviewLogin />} />
      <Route path="/eld/officer-email" element={
        !user ? <LoginRedirect /> : (
          <Suspense fallback={<PortalFallback />}>
            <OfficerEmailSheet onClose={() => { window.location.href = '/roadside'; }} />
          </Suspense>
        )
      } />

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
        ) : (
          // Every role renders its portal in place. Dispatcher used to redirect
          // to /dispatch, which raced the outgoing portal's own URL writer:
          // the writer's setSearchParams landed after <Navigate>, the router
          // location snapped back to /dashboard and nothing rendered — a white
          // page with no error. Rendering in place removes the race, and the
          // boundary guarantees a failure shows a message and a way back
          // instead of an unmounted tree.
          <PortalErrorBoundary name={`${activeRole ? roleLabels[activeRole] : 'Dashboard'} portal`}>
            {activeRole === 'owner' || activeRole === 'management' ? <ManagementPortal /> :
             activeRole === 'onboarding_staff' ? <StaffPortal /> :
             activeRole === 'dispatcher' ? <DispatchPortal /> :
             activeRole === 'operator' || activeRole === 'truck_owner' ? <OperatorPortal /> :
             <ApplicationStatus />}
          </PortalErrorBoundary>
        )
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
        (isDispatcher || isManagement) ? <PortalErrorBoundary name="Dispatch portal"><DispatchPortal /></PortalErrorBoundary> :
        !rolesLoaded ? <PortalFallback /> :
        <Navigate to="/dashboard" replace />
      } />
      <Route path="/management/deactivate/:operatorId" element={
        !user ? <LoginRedirect /> :
        isManagement ? <DeactivationPage /> :
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
        <ShowDemoProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <DemoSuppressionSheet />
          <BrowserRouter>
            <NavTraceRouterListener />
            <PreviewSessionBanner />
            <AppRoutes />
            <IdleWarningModal />
            <TrackOperatorPresence />
          </BrowserRouter>
          <OfflineBanner />
          <PWAInstallBannerBoundary>
            <PWAInstallBanner />
          </PWAInstallBannerBoundary>
        </TooltipProvider>
        </ShowDemoProvider>
      </DemoModeProvider>
      </AuthProvider>
      <BuildStatusBanner />
  </QueryClientProvider>
);

export default App;
