import { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  updateProfile
} from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { useTenant } from './TenantContext';

// Forced correct key for bootstrap
const CORRECT_API_KEY = "AIzaSyB455BHQ7ZIAcO0jwXYbYuzlcvXKt2Qpx4";

interface User {
  id: string;
  uid: string;
  name: string;
  email: string;
  role: 'client' | 'admin' | 'barber';
  barberId?: string;
  tenantId: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { tenantId } = useTenant();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setIsLoading(true);
        try {
          const email = firebaseUser.email?.trim().toLowerCase() || '';
          


          // 2. Check Cache
          const cachedProfile = localStorage.getItem(`user_profile_${firebaseUser.uid}`);
          if (cachedProfile) {
            setUser(JSON.parse(cachedProfile));
            setIsLoading(false); // Instantly dismiss loading screen so user is not blocked
          }

          // 3. Fresh Fetch
          const profilePromise = (async () => {
            // Fetch user profile first to know their true home tenant
            const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid)).catch(() => null);
            const userData = userDoc?.exists() ? userDoc.data() : {};

            // Global query for barbers to find their home tenant
            const barberQuery = query(
              collection(db, 'barbers'), 
              where('email', '==', email)
            );
            const barberSnap = await getDocs(barberQuery).catch(() => ({ empty: true, docs: [] }));
            
            // Filter precisely to avoid any case or spacing issues
            let barberDoc = (!barberSnap || barberSnap.empty) ? null : 
              barberSnap.docs.find(d => {
                const bEmail = d.data().email?.trim().toLowerCase();
                return bEmail && bEmail === email;
              }) || null;
            
            const isBarber = !!barberDoc;
            const barberData = barberDoc?.data();
            const barberId = barberDoc?.id;

            const activeTenantId = userData.tenantId || barberData?.tenantId || tenantId;

            // Resolve Role: Admin always takes absolute priority
            let resolvedRole = userData.role || 'client';
            if (resolvedRole !== 'admin' && isBarber) {
              resolvedRole = 'barber';
            }
            
            // Auto-create user document for barber if it doesn't exist
            if (!userDoc?.exists() && isBarber) {
              try {
                await setDoc(doc(db, 'users', firebaseUser.uid), {
                  uid: firebaseUser.uid,
                  email: email,
                  name: barberData.name || firebaseUser.displayName || 'Coiffeur',
                  role: 'barber',
                  tenantId: activeTenantId,
                  createdAt: new Date().toISOString()
                });
                userData.role = 'barber';
                userData.tenantId = activeTenantId;
              } catch (e) {
                console.error("Could not auto-create barber user profile:", e);
              }
            }
            
            const fullProfile: User = {
              id: firebaseUser.uid,
              uid: firebaseUser.uid,
              email: email,
              name: userData.name || barberData?.name || firebaseUser.displayName || (resolvedRole === 'admin' ? 'Administrateur' : 'Utilisateur'),
              role: resolvedRole as 'admin' | 'barber' | 'client',
              barberId: barberId,
              tenantId: activeTenantId
            };

            setUser(fullProfile);
            localStorage.setItem(`user_profile_${firebaseUser.uid}`, JSON.stringify(fullProfile));
            setIsLoading(false); // Clear loading as soon as we have fresh data
          })();

          // Wait max 3s for fresh data, then proceed
          await Promise.race([
            profilePromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 3000))
          ]);

        } catch (error) {
          console.error("Auth profile fetch issue:", error);
          if (!user) {
            setUser({
              id: firebaseUser.uid,
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              name: firebaseUser.displayName || 'Utilisateur',
              role: 'client',
              tenantId: tenantId
            });
          }
        }
      } else {
        setUser(null);
        // Clear caches on logout
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith('user_profile_')) localStorage.removeItem(key);
        });
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signup = async (email: string, password: string, name: string) => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const firebaseUser = userCredential.user;
    
    await updateProfile(firebaseUser, { displayName: name });
    
    // Create profile in Firestore
    const profile = {
      uid: firebaseUser.uid,
      email,
      name,
      role: 'client', // Default role for new signups
      createdAt: new Date().toISOString(),
      tenantId: tenantId
    };
    
    await setDoc(doc(db, 'users', firebaseUser.uid), profile);
  };

  const logout = async () => {
    await signOut(auth);
  };

  const value = useMemo(() => ({ 
    user, isLoading, login, signup, logout, isAuthenticated: !!user 
  }), [user, isLoading]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
