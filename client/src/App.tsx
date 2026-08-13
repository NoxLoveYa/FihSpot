import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { lazy, Suspense, useRef } from 'react';
import type { ReactNode } from 'react';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ThemeProvider } from './context/ThemeContext';
import { SearchSessionProvider } from './context/SearchSessionContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AdminRoute } from './components/AdminRoute';
import { OfflineBanner } from './components/OfflineBanner';
import { MapPage } from './pages/MapPage';
import { FullScreenLoader } from './components/Spinner';
import { setPreviousPath } from './navigation';

// Non-map pages are lazy-loaded so the startup bundle stays lean: visiting the
// login/register/profiles pages doesn't pull in Google Maps, the scan pipeline
// or framer-motion-heavy admin screens.
const PoisPage = lazy(() => import('./pages/PoisPage').then((m) => ({ default: m.PoisPage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const UserPage = lazy(() => import('./pages/UserPage').then((m) => ({ default: m.UserPage })));
const AdminPage = lazy(() => import('./pages/AdminPage').then((m) => ({ default: m.AdminPage })));
const LoginPage = lazy(() => import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import('./pages/RegisterPage').then((m) => ({ default: m.RegisterPage })));

function PageTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="h-full w-full"
    >
      {children}
    </motion.div>
  );
}

function AnimatedRoutes() {
  const location = useLocation();
  const prevPathRef = useRef<string | null>(null);

  if (prevPathRef.current !== location.pathname) {
    setPreviousPath(prevPathRef.current);
    prevPathRef.current = location.pathname;
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <Routes location={location} key={location.pathname}>
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <PageTransition>
                <MapPage />
              </PageTransition>
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <PageTransition>
                <Suspense fallback={<FullScreenLoader />}>
                  <ProfilePage />
                </Suspense>
              </PageTransition>
            </ProtectedRoute>
          }
        />
        <Route
          path="/user/:id"
          element={
            <ProtectedRoute>
              <PageTransition>
                <Suspense fallback={<FullScreenLoader />}>
                  <UserPage />
                </Suspense>
              </PageTransition>
            </ProtectedRoute>
          }
        />
        <Route
          path="/pois"
          element={
            <ProtectedRoute>
              <PageTransition>
                <Suspense fallback={<FullScreenLoader />}>
                  <PoisPage />
                </Suspense>
              </PageTransition>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <PageTransition>
                <Suspense fallback={<FullScreenLoader />}>
                  <AdminPage />
                </Suspense>
              </PageTransition>
            </AdminRoute>
          }
        />
        <Route
          path="/login"
          element={
            <PageTransition>
              <Suspense fallback={<FullScreenLoader />}>
                <LoginPage />
              </Suspense>
            </PageTransition>
          }
        />
        <Route
          path="/register"
          element={
            <PageTransition>
              <Suspense fallback={<FullScreenLoader />}>
                <RegisterPage />
              </Suspense>
            </PageTransition>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <SearchSessionProvider>
              <div className="h-full w-full">
                <OfflineBanner />
                <AnimatedRoutes />
              </div>
            </SearchSessionProvider>
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
