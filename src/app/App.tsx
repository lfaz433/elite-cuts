import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { Suspense } from 'react';
import { Toaster } from 'sonner';
import PublicLayout from './components/layouts/PublicLayout';
import LandingPage from './components/pages/LandingPage';
import HomePage from './components/pages/HomePage';
import { AuthProvider, useAuth } from './components/context/AuthContext';
import { BusinessProvider } from './components/context/BusinessContext';
import { NotificationProvider } from './components/context/NotificationContext';
import { useTenant } from './components/context/TenantContext';
import SubscriptionGuard from './components/SubscriptionGuard';
import SuperAdminGuard from './components/SuperAdminGuard';
import ErrorBoundary from './components/ErrorBoundary';
import { Scissors } from 'lucide-react';
import { lazy } from 'react';

// Lazy load heavy dashboard components
const ClientDashboard = lazy(() => import('./components/pages/ClientDashboard'));
const AdminDashboard = lazy(() => import('./components/pages/AdminDashboard'));
const BarberDashboard = lazy(() => import('./components/pages/BarberDashboard'));
const SuperAdmin = lazy(() => import('./components/pages/SuperAdmin'));
const BoutiquePage = lazy(() => import('./components/pages/BoutiquePage'));
const Register = lazy(() => import('./components/pages/Register'));
const Onboarding = lazy(() => import('./components/pages/Onboarding'));
const Billing = lazy(() => import('./components/pages/Billing'));

// --- Premium Loading Spinner ---
function AppLoader() {
  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-4">
      <div className="relative">
        <div className="w-16 h-16 border-4 border-[#D4AF37]/20 rounded-full" />
        <div className="w-16 h-16 border-4 border-t-[#D4AF37] rounded-full animate-spin absolute inset-0" />
        <Scissors className="w-6 h-6 text-[#D4AF37] absolute inset-0 m-auto" />
      </div>
      <p className="text-white/40 text-sm tracking-widest uppercase">Chargement...</p>
    </div>
  );
}

// --- Route Guard ---
function ProtectedRoute({ children, role }: { children: React.ReactNode; role?: string }) {
  const { user, isLoading } = useAuth();
  const tenant = useTenant();
  
  if (isLoading || tenant.isLoading) return <AppLoader />;
  
  if (!user) return <Navigate to="/" replace />;
  
  if (user.role === 'superadmin') {
    return <>{children}</>;
  }
  
  if (role && user.role !== role) return <Navigate to="/" replace />;
  
  if (user.role === 'admin' && !tenant.onboardingComplete) {
    return <Navigate to="/onboarding" replace />;
  }
  
  return <>{children}</>;
}

// --- Simple Auth Required Wrapper (ignores subscription status) ---
function AuthRequired({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <AppLoader />;
  if (!user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

// --- Conditional Home Router ---
function HomeRouter() {
  const { user, isLoading } = useAuth();
  
  if (isLoading) return <AppLoader />;
  
  if (user) {
    return <Navigate to={`/${user.role}`} replace />;
  }

  const hostname = window.location.hostname;
  let extractedSubdomain = 'elite-cuts-default';
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    extractedSubdomain = 'elite-cuts-default';
  } else {
    const parts = hostname.split('.');
    if (parts.length > 2) {
      extractedSubdomain = parts[0];
    }
  }

  if (extractedSubdomain === 'elite-cuts-default' || hostname === 'elitecuts.app') {
    return <HomePage />;
  }

  return <LandingPage />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<PublicLayout />}>
        <Route index element={<HomeRouter />} />
        <Route path="boutique" element={<BoutiquePage />} />
        <Route path="register" element={<Register />} />
      </Route>
      <Route path="/login" element={<Navigate to="/?login=true" replace />} />
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/billing" element={<AuthRequired><Billing /></AuthRequired>} />
      <Route path="/superadmin/*" element={<SuperAdminGuard><SuperAdmin /></SuperAdminGuard>} />
      <Route path="/client/*" element={<ProtectedRoute role="client"><ClientDashboard /></ProtectedRoute>} />
      <Route path="/admin/*" element={<ProtectedRoute role="admin"><SubscriptionGuard><AdminDashboard /></SubscriptionGuard></ProtectedRoute>} />
      <Route path="/barber/*" element={<ProtectedRoute role="barber"><SubscriptionGuard><BarberDashboard /></SubscriptionGuard></ProtectedRoute>} />
      {/* Catch-all: redirect to home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <NotificationProvider>
            <BusinessProvider>
              <div className="min-h-screen bg-black text-white">
                <Suspense fallback={<AppLoader />}>
                  <AppRoutes />
                </Suspense>
              </div>
              <Toaster
                position="top-center"
                richColors
                toastOptions={{
                  style: {
                    background: '#141414',
                    border: '1px solid rgba(212,175,55,0.3)',
                    color: 'white',
                    borderRadius: '16px',
                    padding: '16px 20px',
                    gap: '12px',
                    fontSize: '14px',
                    lineHeight: '1.5',
                    boxShadow: '0 20px 40px -15px rgba(0,0,0,0.5)',
                  },
                }}
              />
            </BusinessProvider>
          </NotificationProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
