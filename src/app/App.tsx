import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { Suspense } from 'react';
import { Toaster } from 'sonner';
import PublicLayout from './components/layouts/PublicLayout';
import LandingPage from './components/pages/LandingPage';
import ClientDashboard from './components/pages/ClientDashboard';
import AdminDashboard from './components/pages/AdminDashboard';
import BarberDashboard from './components/pages/BarberDashboard';
import { AuthProvider, useAuth } from './components/context/AuthContext';
import { BusinessProvider } from './components/context/BusinessContext';
import ErrorBoundary from './components/ErrorBoundary';
import { Scissors } from 'lucide-react';

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
  
  if (isLoading) return <AppLoader />;
  
  if (!user) return <Navigate to="/" replace />;
  if (role && user.role !== role) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<PublicLayout />}>
        <Route index element={<LandingPage />} />
      </Route>
      <Route path="/client/*" element={<ProtectedRoute role="client"><ClientDashboard /></ProtectedRoute>} />
      <Route path="/admin/*" element={<ProtectedRoute role="admin"><AdminDashboard /></ProtectedRoute>} />
      <Route path="/barber/*" element={<ProtectedRoute role="barber"><BarberDashboard /></ProtectedRoute>} />
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
          <BusinessProvider>
            <div className="min-h-screen bg-black text-white">
              <Suspense fallback={<AppLoader />}>
                <AppRoutes />
              </Suspense>
            </div>
            <Toaster
              position="top-right"
              toastOptions={{
                style: {
                  background: '#141414',
                  border: '1px solid rgba(212,175,55,0.3)',
                  color: 'white',
                },
              }}
            />
          </BusinessProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
