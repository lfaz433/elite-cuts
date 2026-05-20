import React from 'react';
import { Navigate } from 'react-router';
import { useTenant } from './context/TenantContext';
import { useAuth } from './context/AuthContext';

export default function SubscriptionGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.role === 'superadmin') {
    return <>{children}</>;
  }

  const tenant = useTenant();

  if (tenant.isLoading) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center text-white/50 text-xs tracking-widest uppercase animate-pulse">
        Vérification de l'abonnement...
      </div>
    );
  }

  const status = tenant.subscription?.status;
  const trialEndsAt = tenant.subscription?.trialEndsAt || 0;

  if (status === 'trialing' && Date.now() > trialEndsAt) {
    return <Navigate to="/billing?expired=true" replace />;
  }

  if (status === 'canceled' || status === 'past_due') {
    return <Navigate to="/billing" replace />;
  }

  return <>{children}</>;
}
