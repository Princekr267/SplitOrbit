import React, { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import { m, AnimatePresence } from 'motion/react';
import { durations, easings } from './motion/tokens.js';
import BrandedAuthSkeleton from './components/common/BrandedAuthSkeleton.jsx';
import { isValidNextUrl } from './utils/url.js';

import LandingPage from './pages/LandingPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import PasswordChangedBanner from './components/common/PasswordChangedBanner.jsx';
import ImpersonationBanner from './components/common/ImpersonationBanner.jsx';
import ErrorBoundary from './components/common/ErrorBoundary.jsx';
import ServerWakingIndicator from './components/common/ServerWakingIndicator.jsx';
import { safeLazy } from './utils/safeLazy.js';
import { forceResetAllOverlays } from './utils/overlayManager.js';

const HostDashboardPage = safeLazy(() => import('./pages/HostDashboardPage.jsx'));
const GroupDetailPage = safeLazy(() => import('./pages/GroupDetailPage.jsx'));
const PublicStatementPage = safeLazy(() => import('./pages/PublicStatementPage.jsx'));
const InviteAcceptPage = safeLazy(() => import('./pages/InviteAcceptPage.jsx'));
const FriendDashboardPage = safeLazy(() => import('./pages/FriendDashboardPage.jsx'));
const AdminDashboardPage = safeLazy(() => import('./pages/AdminDashboardPage.jsx'));
const ForgotPasswordPage = safeLazy(() => import('./pages/ForgotPasswordPage.jsx'));
const ResetPasswordPage = safeLazy(() => import('./pages/ResetPasswordPage.jsx'));
const ProfilePage = safeLazy(() => import('./pages/ProfilePage.jsx'));
const Calculator = safeLazy(() => import('./components/calculator/Calculator.jsx'));

const DevChartsPage = import.meta.env.DEV
  ? safeLazy(() => import('./pages/DevChartsPage.jsx'))
  : null;

function ProtectedRoute({ children }) {
  const { user, status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return <BrandedAuthSkeleton />;
  }

  if (status !== 'authenticated' || !user) {
    const currentPath = `${location.pathname}${location.search}`;
    const nextParam = isValidNextUrl(currentPath)
      ? `?next=${encodeURIComponent(currentPath)}`
      : '';
    return <Navigate to={`/login${nextParam}`} replace />;
  }

  return children;
}

function GuestOnlyRoute({ children }) {
  const { user, status } = useAuth();
  const [searchParams] = useSearchParams();

  if (status === 'loading') {
    return <BrandedAuthSkeleton />;
  }

  if (status === 'authenticated' && user) {
    const next = searchParams.get('next');
    if (isValidNextUrl(next)) {
      return <Navigate to={next} replace />;
    }
    if (user.role === 'admin') {
      return <Navigate to="/admin" replace />;
    }
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

export default function App() {
  const location = useLocation();

  // Scroll to top and clean up any open overlays/locks on route change
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    forceResetAllOverlays();
  }, [location.pathname]);

  return (
    <>
      <ServerWakingIndicator />
      <AnimatePresence initial={false}>
        <m.div
          key={location.pathname}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{
            duration: durations.base,
            ease: easings.premium,
          }}
          className="w-full min-h-screen flex flex-col"
        >
          <ImpersonationBanner />
          <PasswordChangedBanner />
          <ErrorBoundary>
            <React.Suspense fallback={<BrandedAuthSkeleton />}>
              <Routes location={location}>
                <Route path="/" element={<LandingPage />} />
                <Route
                  path="/login"
                  element={
                    <GuestOnlyRoute>
                      <LoginPage />
                    </GuestOnlyRoute>
                  }
                />
                <Route
                  path="/register"
                  element={
                    <GuestOnlyRoute>
                      <RegisterPage />
                    </GuestOnlyRoute>
                  }
                />
                <Route
                  path="/forgot-password"
                  element={
                    <GuestOnlyRoute>
                      <ForgotPasswordPage />
                    </GuestOnlyRoute>
                  }
                />
                <Route path="/reset-password" element={<ResetPasswordPage />} />

                {/* Level 1: Public Read-Only Share Link */}
                <Route path="/s/:token" element={<PublicStatementPage />} />

                {/* Level 2: Single-Use Claim Invite Link */}
                <Route path="/invite/:code" element={<InviteAcceptPage />} />

                {/* Protected Host & Friend Routes */}
                <Route
                  path="/dashboard"
                  element={
                    <ProtectedRoute>
                      <HostDashboardPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/friend"
                  element={
                    <ProtectedRoute>
                      <FriendDashboardPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin"
                  element={
                    <ProtectedRoute>
                      <AdminDashboardPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/groups/:groupId"
                  element={
                    <ProtectedRoute>
                      <GroupDetailPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/profile"
                  element={
                    <ProtectedRoute>
                      <ProfilePage />
                    </ProtectedRoute>
                  }
                />

                {import.meta.env.DEV && DevChartsPage && (
                  <Route
                    path="/dev/charts"
                    element={
                      <React.Suspense fallback={<div className="p-8 text-center text-text-muted">Loading Visual QA...</div>}>
                        <DevChartsPage />
                      </React.Suspense>
                    }
                  />
                )}

                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </React.Suspense>
          </ErrorBoundary>
        </m.div>
      </AnimatePresence>

      {/* Built-in Floating Safe Calculator (available on every page) */}
      <React.Suspense fallback={null}>
        <Calculator />
      </React.Suspense>
    </>
  );
}
