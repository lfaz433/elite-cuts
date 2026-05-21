import React, { createContext, useContext, useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs, addDoc, doc, getDoc } from 'firebase/firestore';
import { getAuth, onAuthStateChanged } from 'firebase/auth';

export interface TenantData {
  tenantId: string;
  name: string;
  branding: { primaryColor: string; logoUrl: string; businessName: string };
  subscription: { 
    status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'frozen'; 
    planId: string;
    trialEndsAt?: number;
    currentPeriodEnd?: number;
  };
  settings: { maxBarbersLimit: number; allowOnlineBooking: boolean };
  onboardingComplete?: boolean;
}

interface TenantContextType extends TenantData {
  isLoading: boolean;
}

const TenantContext = createContext<TenantContextType | null>(null);

export function useTenant() {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
}

function extractSubdomain(hostname: string): string {
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.endsWith('.vercel.app') ||
    hostname === 'barbeboard.pro' ||
    hostname === 'www.barbeboard.pro'
  ) {
    return 'elite-cuts-default';
  }
  if (hostname.endsWith('.barbeboard.pro')) {
    return hostname.split('.')[0];
  }
  return 'elite-cuts-default';
}

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const [tenant, setTenant] = useState<TenantData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const getSubdomain = () => {
    return extractSubdomain(window.location.hostname);
  };

  useEffect(() => {
    const fetchTenant = async () => {
      const subdomain = getSubdomain();
      const hostname = window.location.hostname;
      const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

      try {
        const tenantsRef = collection(db, 'tenants');
        const q = query(tenantsRef, where('subdomain', '==', subdomain));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          const doc = querySnapshot.docs[0];
          const data = doc.data();
          setTenant({
            tenantId: doc.id,
            name: data.name,
            branding: data.branding,
            subscription: {
              status: data.subscription?.status || 'trialing',
              planId: data.subscription?.planId || 'basic',
              trialEndsAt: data.subscription?.trialEndsAt || 0,
              currentPeriodEnd: data.subscription?.currentPeriodEnd || 0,
            },
            settings: data.settings,
            onboardingComplete: data.onboardingComplete || false,
          });
        } else {
          if (subdomain === 'elite-cuts-default') {
            const fallbackTenant = {
              tenantId: 'default-tenant',
              name: "Barbeboard",
              branding: { primaryColor: "#D4AF37", logoUrl: "", businessName: "Barbeboard" },
              subscription: { 
                status: "active" as const, 
                planId: "basic",
                trialEndsAt: Date.now() + 14 * 24 * 60 * 60 * 1000,
                currentPeriodEnd: 0
              },
              settings: { maxBarbersLimit: 3, allowOnlineBooking: true }
            };
            
            // Auto-seed ONLY on localhost/127.0.0.1
            if (isLocalhost) {
              console.log('Localhost: Seeding default tenant document in Firestore...');
              const docRef = await addDoc(tenantsRef, {
                subdomain: "elite-cuts-default",
                name: fallbackTenant.name,
                branding: fallbackTenant.branding,
                subscription: fallbackTenant.subscription,
                settings: fallbackTenant.settings
              });
              setTenant({ ...fallbackTenant, tenantId: docRef.id });
            } else {
              setTenant(fallbackTenant);
            }
          } else {
            setError('Barbershop not found');
          }
        }
      } catch (err: any) {
        console.error('Error fetching tenant:', err);
        setError(err.message || 'Error loading tenant settings');
      } finally {
        setIsLoading(false);
      }
    };

    fetchTenant();
  }, []);

  useEffect(() => {
    const auth = getAuth();
    return onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        const userTenantId = userDoc.data()?.tenantId;
        if (userTenantId && userTenantId !== tenant?.tenantId) {
          // Load the correct tenant for this user
          const tenantDoc = await getDoc(doc(db, 'tenants', userTenantId));
          if (tenantDoc.exists()) {
            const data = tenantDoc.data();
            setTenant({
              tenantId: tenantDoc.id,
              name: data.name,
              branding: data.branding,
              subscription: {
                status: data.subscription?.status || 'trialing',
                planId: data.subscription?.planId || 'basic',
                trialEndsAt: data.subscription?.trialEndsAt || 0,
                currentPeriodEnd: data.subscription?.currentPeriodEnd || 0,
              },
              settings: data.settings,
              onboardingComplete: data.onboardingComplete || false,
            });
          }
        }
      }
    });
  }, [tenant?.tenantId]);

  useEffect(() => {
    if (tenant) {
      document.documentElement.style.setProperty('--primary-color', tenant.branding.primaryColor);
      console.log('Tenant primary color applied:', getComputedStyle(document.documentElement).getPropertyValue('--primary-color'));
    }
  }, [tenant]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center text-white">
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 rounded-full border-4 border-white/10"></div>
          <div className="absolute inset-0 rounded-full border-4 border-t-[#D4AF37] animate-spin"></div>
        </div>
        <p className="mt-6 text-sm uppercase tracking-widest text-white/50 animate-pulse font-medium">
          Chargement de l'espace...
        </p>
      </div>
    );
  }

  if (error || !tenant) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6 text-center text-white">
        <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 mb-8 border border-red-500/20">
          <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h1 className="text-3xl font-extrabold mb-2 tracking-tight bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
          Salon Introuvable
        </h1>
        <p className="text-white/60 max-w-md text-sm leading-relaxed mb-8">
          L'adresse demandée ne correspond à aucun salon enregistré sur notre plateforme. Veuillez vérifier l'orthographe du sous-domaine.
        </p>
        <div className="px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs text-white/40 font-mono">
          Sous-domaine: <span className="text-[#D4AF37]">{getSubdomain()}</span>
        </div>
      </div>
    );
  }

  return (
    <TenantContext.Provider value={{ ...tenant, isLoading }}>
      {children}
    </TenantContext.Provider>
  );
}
