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
          
          // 1. FAST TRACK: Hardcoded admin check (Sync/Instant)
          const hardcodedAdmins = ['admin@test.com', 'admin-elite@test.com'];
          const isHardcodedAdmin = hardcodedAdmins.includes(email) || 
                                  (email.startsWith('admin-') && email.endsWith('@test.com'));

          if (isHardcodedAdmin) {
            try {
              const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
              if (userDoc.exists() && userDoc.data().role === 'superadmin') {
                const superProfile: User = {
                  id: firebaseUser.uid,
                  uid: firebaseUser.uid,
                  email: email,
                  name: userDoc.data().name || 'Super Admin',
                  role: 'superadmin',
                  tenantId: userDoc.data().tenantId || tenantId
                };
                setUser(superProfile);
                localStorage.setItem(`user_profile_${firebaseUser.uid}`, JSON.stringify(superProfile));
                setIsLoading(false);
                return;
              }
            } catch (err) {
              console.error("Error fetching superadmin status for hardcoded admin:", err);
            }

            const adminProfile: User = {
              id: firebaseUser.uid,
              uid: firebaseUser.uid,
              email: email,
              name: 'Administrateur',
              role: 'admin',
              tenantId: tenantId
            };
            setUser(adminProfile);
            localStorage.setItem(`user_profile_${firebaseUser.uid}`, JSON.stringify(adminProfile));
            setIsLoading(false);
            return;
          }

          // 2. Check Cache
          const cachedProfile = localStorage.getItem(`user_profile_${firebaseUser.uid}`);
          if (cachedProfile) {
            setUser(JSON.parse(cachedProfile));
            setIsLoading(false); // Instantly dismiss loading screen so user is not blocked
          }

          // 3. Fresh Fetch
          const profilePromise = (async () => {
            const [adminEmailSnap, barberSnap, userDoc] = await Promise.all([
              getDoc(doc(db, 'business', 'info')).catch(() => null),
              getDocs(query(collection(db, 'barbers'), where('email', '==', email))).catch(() => ({ empty: true, docs: [] })),
              getDoc(doc(db, 'users', firebaseUser.uid)).catch(() => null)
            ]);

            const bizData = adminEmailSnap?.exists() ? adminEmailSnap.data() : null;
            const isAdmin = email === bizData?.adminEmail?.toLowerCase();
            
            // Check barber by email (case-insensitive and space-resilient)
            let isBarber = barberSnap && !barberSnap.empty;
            let barberDoc = isBarber ? barberSnap.docs[0] : null;

            // If not found or if the direct match was imprecise, scan all barbers to avoid Firestore spacing bugs
            if (!isBarber || !barberDoc?.data().email || barberDoc.data().email.trim().toLowerCase() !== email) {
               const allBarbers = await getDocs(collection(db, 'barbers')).catch(() => null);
               if (allBarbers) {
                 barberDoc = allBarbers.docs.find(d => {
                   const bEmail = d.data().email?.trim().toLowerCase();
                   return bEmail && bEmail === email;
                 }) || null;
                 isBarber = !!barberDoc;
               }
             }

            const barberData = barberDoc?.data();
            const barberId = barberDoc?.id;
            const userData = userDoc?.exists() ? userDoc.data() : {};

            const resolvedRole = isAdmin ? 'admin' : (isBarber ? 'barber' : (userData.role || 'client'));
            
            const fullProfile: User = {
              id: firebaseUser.uid,
              uid: firebaseUser.uid,
              email: email,
              name: userData.name || barberData?.name || firebaseUser.displayName || (isAdmin ? 'Administrateur' : 'Utilisateur'),
              role: resolvedRole as 'admin' | 'barber' | 'client',
              barberId: barberId,
              tenantId: userData.tenantId || tenantId
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
