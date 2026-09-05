import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import {
  loadSessionUser,
  MembershipSummary,
  SessionUser,
} from '../../lib/session';
import { legacyRoleForLocation, membershipForLocation } from '../../lib/sessionAccess';
import type { MembershipRole } from '../../lib/marketplace/types';
import { useTenant } from './TenantContext';

type LegacyRole = 'client' | 'admin' | 'barber' | 'superadmin';

export interface User extends SessionUser {
  id: string;
  name: string;
  phone?: string;
  role: LegacyRole;
  barberId?: string;
  tenantId: string;
  marketplaceRole?: MembershipRole;
  brandId?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string, phone?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function membershipRole(membership?: MembershipSummary): LegacyRole {
  if (!membership) return 'client';
  if (membership.role === 'principal_admin' || membership.role === 'salon_admin' || membership.role === 'admin') {
    return 'admin';
  }
  if (membership.role === 'worker' || membership.role === 'barber') {
    return 'barber';
  }
  return 'client';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { tenantId } = useTenant();

  const hydrateSession = useCallback(async (firebaseUser: NonNullable<typeof auth.currentUser>) => {
    const [session, token] = await Promise.all([
      loadSessionUser(firebaseUser),
      firebaseUser.getIdTokenResult(),
    ]);
    const activeMembership = membershipForLocation(session.memberships, tenantId);
    const brandPrincipal = session.memberships.find(membership => (
      membership.role === 'principal_admin' && !membership.locationId
    ));
    const marketplaceManager = brandPrincipal ?? session.memberships.find(membership => (
      membership.role === 'principal_admin' || membership.role === 'salon_admin'
    ));
    const isPlatformAdmin = token.claims.superadmin === true || token.claims.platformAdmin === true;
    const claimedTenantId = typeof token.claims.tenantId === 'string'
      ? token.claims.tenantId
      : undefined;
    const scopedClaimTenantId = claimedTenantId === tenantId
      ? claimedTenantId
      : undefined;
    const role = isPlatformAdmin
      ? 'superadmin'
      : activeMembership
        ? membershipRole(activeMembership)
        : legacyRoleForLocation(token.claims.role, claimedTenantId, tenantId);

    setUser({
      ...session,
      id: session.uid,
      name: session.displayName || (role === 'admin' ? 'Administrateur' : 'Utilisateur'),
      role,
      barberId: activeMembership?.barberId,
      tenantId: activeMembership?.locationId ?? scopedClaimTenantId ?? tenantId,
      marketplaceRole: marketplaceManager?.role as MembershipRole | undefined,
      brandId: marketplaceManager?.brandId,
    });
  }, [tenantId]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        await hydrateSession(firebaseUser);
      } catch (error) {
        console.error('Auth session fetch failed:', error);
        setUser({
          id: firebaseUser.uid,
          uid: firebaseUser.uid,
          email: firebaseUser.email?.trim().toLowerCase() ?? '',
          displayName: firebaseUser.displayName ?? '',
          name: firebaseUser.displayName ?? 'Utilisateur',
          role: 'client',
          tenantId,
          memberships: [],
        });
      } finally {
        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, [hydrateSession, tenantId]);

  const login = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signup = async (email: string, password: string, name: string, phone?: string) => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const firebaseUser = userCredential.user;

    await updateProfile(firebaseUser, { displayName: name });
    await setDoc(doc(db, 'users', firebaseUser.uid), {
      uid: firebaseUser.uid,
      email: email.trim().toLowerCase(),
      name,
      displayName: name,
      phone: phone ?? '',
      createdAt: serverTimestamp(),
    });
  };

  const logout = async () => {
    await signOut(auth);
  };

  const refreshSession = useCallback(async () => {
    if (!auth.currentUser) {
      setUser(null);
      return;
    }
    setIsLoading(true);
    try {
      await hydrateSession(auth.currentUser);
    } finally {
      setIsLoading(false);
    }
  }, [hydrateSession]);

  const value = useMemo(() => ({
    user,
    isLoading,
    login,
    signup,
    logout,
    refreshSession,
    isAuthenticated: user !== null,
  }), [user, isLoading, refreshSession]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
