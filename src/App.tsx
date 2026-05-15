import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { DemoModeProvider } from "@/hooks/useDemoMode";
import IdleWarningModal from "@/components/IdleWarningModal";
import PWAInstallBanner from "@/components/PWAInstallBanner";
import PWAInstallBannerBoundary from "@/components/PWAInstallBannerBoundary";
import TrackOperatorPresence from "@/components/TrackOperatorPresence";
import { useVersionCheck } from "@/hooks/useVersionCheck";

// Pages
import LoginPage from "./pages/LoginPage";
import ResetPassword from "./pages/ResetPassword";
import WelcomeOperator from "./pages/WelcomeOperator";
import ApplicationForm from "./pages/ApplicationForm";
import ApplicationStatus from "./pages/ApplicationStatus";
import OperatorPortal from "./pages/operator/OperatorPortal";
import StaffPortal from "./pages/staff/StaffPortal";
import ManagementPortal from "./pages/management/ManagementPortal";
import DispatchPortal from "./pages/dispatch/DispatchPortal";
import NotFound from "./pages/NotFound";
import SplashPage from "./pages/SplashPage";
import InspectionSharePage from "./pages/InspectionSharePage";
import SubmitSSN from "./pages/SubmitSSN";
import InstallApp from "./pages/InstallApp";
import PEIRespond from "./pages/PEIRespond";
import PEIRelease from "./pages/PEIRelease";
import ApplicationApprove from "./pages/ApplicationApprove";

const queryClient = new QueryClient();

function AppRoutes() {
  const { user, loading, roles, isManagement, isOnboardingStaff, isDispatcher, isOperator, activeRole } = useAuth();

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

      {/* Protected routes */}
      <Route path="/dashboard" element={
        !user ? <Navigate to="/login" replace /> :
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
        <ApplicationStatus />
      } />

      {/* Role-specific portals */}
      <Route path="/staff/*" element={
        !user ? <Navigate to="/login" replace /> :
        (isOnboardingStaff || isManagement) ? <StaffPortal /> :
        <Navigate to="/dashboard" replace />
      } />
      <Route path="/dispatch/*" element={
        !user ? <Navigate to="/login" replace /> :
        (isDispatcher || isManagement) ? <DispatchPortal /> :
        <Navigate to="/dashboard" replace />
      } />
      <Route path="/management/*" element={
        !user ? <Navigate to="/login" replace /> :
        isManagement ? <ManagementPortal /> :
        <Navigate to="/dashboard" replace />
      } />
      <Route path="/operator/*" element={
        !user ? <Navigate to="/login" replace /> :
        (isOperator || isManagement) ? <OperatorPortal /> :
        <Navigate to="/dashboard" replace />
      } />
      <Route path="/status" element={
        !user ? <Navigate to="/login" replace /> :
        <ApplicationStatus />
      } />

      {/* Root redirect */}
      <Route path="/" element={user ? <Navigate to="/dashboard" replace /> : <SplashPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
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
            <AppRoutes />
            <IdleWarningModal />
            <TrackOperatorPresence />
          </BrowserRouter>
          <PWAInstallBannerBoundary>
            <PWAInstallBanner />
          </PWAInstallBannerBoundary>
        </TooltipProvider>
      </DemoModeProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
