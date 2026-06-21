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
const DocsPage = lazy(() => import('./components/pages/DocsPage'));

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
  


  // Show HomePage on: localhost, vercel preview URLs, and main domain
  const isMainDomain = 
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.endsWith('.vercel.app') ||
    hostname === 'barberboard.pro' ||
    hostname === 'www.barberboard.pro';
  
  if (isMainDomain) {
    return <HomePage />;
  }
  
  // Show LandingPage only for tenant subdomains (e.g. mysalon.barberboard.pro)
  return <LandingPage />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<PublicLayout />}>
        <Route index element={<HomeRouter />} />
        <Route path="register" element={<Register />} />
        <Route path="docs" element={<DocsPage />} />
      </Route>
      <Route path="/boutique" element={<Navigate to="/" replace />} />
      <Route path="/login" element={<Navigate to="/?login=true" replace />} />
      <Route path="/onboarding" element={<AuthRequired><Onboarding /></AuthRequired>} />
      <Route path="/billing" element={<AuthRequired><Billing /></AuthRequired>} />
      <Route path="/superadmin/*" element={<SuperAdminGuard><SuperAdmin /></SuperAdminGuard>} />
      <Route path="/client/*" element={<ProtectedRoute role="client"><ClientDashboard /></ProtectedRoute>} />
      <Route path="/admin/*" element={<ProtectedRoute role="admin"><SubscriptionGuard><AdminDashboard /></SubscriptionGuard></ProtectedRoute>} />
      <Route path="/barber/*" element={<ProtectedRoute role="barber"><SubscriptionGuard><BarberDashboard /></SubscriptionGuard></ProtectedRoute>} />
      {/* Catch-all 404 page */}
      <Route path="*" element={
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '80px', marginBottom: '16px' }}>✂️</div>
            <h1 style={{ fontSize: '48px', fontWeight: 'bold', color: '#D4AF37', marginBottom: '16px' }}>404</h1>
            <p style={{ color: '#9ca3af', marginBottom: '24px' }}>Page introuvable</p>
            <a href="/" style={{ color: '#D4AF37', textDecoration: 'underline' }}>← Retour à l'accueil</a>
          </div>
        </div>
      } />
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
