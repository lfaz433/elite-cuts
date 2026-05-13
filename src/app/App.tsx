import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { useState } from 'react';
import PublicLayout from './components/layouts/PublicLayout';
import LandingPage from './components/pages/LandingPage';
import ClientDashboard from './components/pages/ClientDashboard';
import AdminDashboard from './components/pages/AdminDashboard';
import BarberDashboard from './components/pages/BarberDashboard';
import { AuthProvider, useAuth } from './components/context/AuthContext';
import { BusinessProvider } from './components/context/BusinessContext';

function ProtectedRoute({ children, role }: { children: React.ReactNode; role?: string }) {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (role && user.role !== role) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<PublicLayout />}>
        <Route index element={<LandingPage />} />
      </Route>
      <Route
        path="/client/*"
        element={
          <ProtectedRoute role="client">
            <ClientDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/*"
        element={
          <ProtectedRoute role="admin">
            <AdminDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/barber/*"
        element={
          <ProtectedRoute role="barber">
            <BarberDashboard />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <BusinessProvider>
          <div className="min-h-screen bg-background text-foreground">
            <AppRoutes />
          </div>
        </BusinessProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
